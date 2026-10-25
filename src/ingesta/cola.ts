// Cola de trabajo sobre Postgres. Ver db/003_ingesta.sql para el porque.

import { createHash } from "node:crypto";
import { consultar, unaFila } from "@/lib/db";
import { esperaReintento, merecePena, type ModoEncolado } from "@/ingesta/planificador";
import type { Crudo } from "@/ingesta/adaptador";

export type TipoTrabajo = "descubrir" | "detalle" | "refrescar" | "enriquecer";

export interface Trabajo {
  id: number;
  fuente: string;
  tipo: TipoTrabajo;
  referencia: string | null;
  intentos: number;
  max_intentos: number;
}

// Dos maneras de encolar, que se distinguen en como se funde la peticion con
// una fila que ya exista para la misma subasta y el mismo tipo de trabajo. La
// tabla completa y el porque estan junto a `fusionarEncolado` en
// src/ingesta/planificador.ts, que es la version pura de estas dos consultas
// y la que se prueba; si se cambia una hay que cambiar la otra.
//
//   adelantar  no toca un trabajo hecho ni uno en marcha; adelanta un pendiente
//              (gana la fecha y la prioridad mas tempranas) y reintenta un
//              fallido desde cero. Es lo que hace el descubrimiento, y por eso
//              una ficha ya bajada no vuelve a bajarse cada pasada.
//   programar  la fecha y la prioridad nuevas mandan, este como este la fila.
//              Es lo que hace un refresco al reprogramarse: su propia fila
//              esta en 'ejecutando' en ese momento, y despues `completar` la
//              respeta porque solo cierra lo que sigue en 'ejecutando'.
const SQL_ENCOLAR: Record<ModoEncolado, string> = {
  adelantar: `
    insert into trabajo (fuente, tipo, referencia, prioridad, ejecutar_tras)
    values ($1, $2, $3, $4, $5)
    on conflict (fuente, tipo, referencia) do update set
      estado = 'pendiente',
      prioridad = least(trabajo.prioridad, excluded.prioridad),
      ejecutar_tras = least(trabajo.ejecutar_tras, excluded.ejecutar_tras),
      intentos = case when trabajo.estado = 'fallido' then 0 else trabajo.intentos end,
      actualizado = now()
    where trabajo.estado in ('pendiente', 'fallido')`,
  programar: `
    insert into trabajo (fuente, tipo, referencia, prioridad, ejecutar_tras)
    values ($1, $2, $3, $4, $5)
    on conflict (fuente, tipo, referencia) do update set
      estado = 'pendiente',
      prioridad = excluded.prioridad,
      ejecutar_tras = excluded.ejecutar_tras,
      intentos = 0,
      ultimo_error = null,
      actualizado = now()`,
};

/** Encola un trabajo, o lo funde con el que ya hubiera segun el modo. */
export async function encolar(opciones: {
  fuente: string;
  tipo: TipoTrabajo;
  referencia?: string | null;
  prioridad?: number;
  ejecutarTras?: Date;
  /** Por defecto "adelantar". Ver SQL_ENCOLAR. */
  modo?: ModoEncolado;
}): Promise<void> {
  await consultar(
    SQL_ENCOLAR[opciones.modo ?? "adelantar"],
    [opciones.fuente, opciones.tipo, opciones.referencia ?? null,
     opciones.prioridad ?? 100, opciones.ejecutarTras ?? new Date()],
  );
}

export async function tomar(fuente: string, cuantos: number): Promise<Trabajo[]> {
  return consultar<Trabajo>(`select * from tomar_trabajos($1, $2)`, [fuente, cuantos]);
}

/**
 * Da por hecho un trabajo. Solo si sigue en 'ejecutando': un refresco que se
 * ha reprogramado a si mismo (encolar con modo "programar") ya ha dejado su
 * fila en 'pendiente' con la fecha siguiente, y esto no debe deshacerlo.
 */
export async function completar(id: number): Promise<void> {
  await consultar(
    `update trabajo set estado = 'hecho', ultimo_error = null, actualizado = now()
     where id = $1 and estado = 'ejecutando'`,
    [id],
  );
}

/** Devuelve el trabajo a la cola con espera creciente, o lo da por perdido. */
export async function fallar(trabajo: Trabajo, error: unknown): Promise<"reintenta" | "rendido"> {
  const mensaje = error instanceof Error ? error.message : String(error);
  const rendirse = !merecePena(error) || trabajo.intentos >= trabajo.max_intentos;

  if (rendirse) {
    await consultar(
      `update trabajo set estado = 'fallido', ultimo_error = $2, actualizado = now() where id = $1`,
      [trabajo.id, mensaje.slice(0, 2000)],
    );
    return "rendido";
  }

  await consultar(
    `update trabajo set estado = 'pendiente', ultimo_error = $2,
            ejecutar_tras = now() + make_interval(secs => $3), actualizado = now()
     where id = $1`,
    [trabajo.id, mensaje.slice(0, 2000), esperaReintento(trabajo.intentos) / 1000],
  );
  return "reintenta";
}

/** Un worker que muere deja trabajos colgados en 'ejecutando'. */
export async function rescatar(minutos = 30): Promise<number> {
  const fila = await unaFila<{ rescatar_trabajos: number }>(
    `select rescatar_trabajos($1)`, [minutos],
  );
  return fila?.rescatar_trabajos ?? 0;
}

export async function guardarCrudo(
  fuente: string, idExterno: string, piezas: Crudo[],
): Promise<void> {
  for (const pieza of piezas) {
    const hash = createHash("sha256")
      .update(`${pieza.etiqueta}\u0000${pieza.contenido}`).digest("hex");
    // Si el contenido no ha cambiado no se duplica la fila: solo interesa
    // guardar versiones distintas.
    await consultar(
      `insert into contenido_crudo (fuente, id_externo, tipo_mime, hash, contenido)
       values ($1, $2, $3, $4, $5)
       on conflict (fuente, id_externo, hash) do nothing`,
      [fuente, idExterno, pieza.tipoMime ?? "text/html", hash, pieza.contenido],
    );
  }
}

export interface Ejecucion {
  id: number;
}

export async function abrirEjecucion(fuente: string): Promise<number> {
  const fila = await unaFila<Ejecucion>(
    `insert into ejecucion (fuente) values ($1) returning id`, [fuente],
  );
  return fila!.id;
}

export async function cerrarEjecucion(
  id: number,
  resumen: { descubiertas: number; procesadas: number; nuevas: number; actualizadas: number; fallidas: number; error?: string },
): Promise<void> {
  await consultar(
    `update ejecucion set fin = now(), descubiertas = $2, procesadas = $3,
            nuevas = $4, actualizadas = $5, fallidas = $6, error = $7
     where id = $1`,
    [id, resumen.descubiertas, resumen.procesadas, resumen.nuevas,
     resumen.actualizadas, resumen.fallidas, resumen.error ?? null],
  );
}

export async function estadoCola(fuente: string) {
  return consultar<{ tipo: string; estado: string; n: number }>(
    `select tipo::text, estado::text, count(*)::bigint as n
     from trabajo where fuente = $1 group by tipo, estado order by tipo, estado`,
    [fuente],
  );
}
