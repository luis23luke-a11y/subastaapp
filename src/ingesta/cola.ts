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
    select $1::text, $2::trabajo_tipo, r, $4::int, $5::timestamptz
    from unnest($3::text[]) as r
    on conflict (fuente, tipo, referencia) do update set
      estado = 'pendiente',
      prioridad = least(trabajo.prioridad, excluded.prioridad),
      ejecutar_tras = least(trabajo.ejecutar_tras, excluded.ejecutar_tras),
      intentos = case when trabajo.estado = 'fallido' then 0 else trabajo.intentos end,
      actualizado = now()
    where trabajo.estado in ('pendiente', 'fallido')`,
  programar: `
    insert into trabajo (fuente, tipo, referencia, prioridad, ejecutar_tras)
    select $1::text, $2::trabajo_tipo, r, $4::int, $5::timestamptz
    from unnest($3::text[]) as r
    on conflict (fuente, tipo, referencia) do update set
      estado = 'pendiente',
      prioridad = excluded.prioridad,
      ejecutar_tras = excluded.ejecutar_tras,
      intentos = 0,
      ultimo_error = null,
      actualizado = now()`,
};

/** Filas por sentencia al encolar en bloque. Mil referencias caben de sobra en
 *  un array de Postgres; el tope es solo por no mandar un parametro enorme. */
const TANDA_ENCOLADO = 500;

/**
 * Encola varios trabajos del mismo tipo de una vez, o los funde con los que
 * ya hubiera segun el modo. Una sola sentencia por tanda: el descubrimiento
 * del BOE son 1.225 fichas, y encolarlas una a una desde el runner de GitHub
 * (Estados Unidos) contra Neon (Francfort) eran 1.225 idas y vueltas, unos
 * cuatro minutos de cada pasada de catorce (medido el 26 de octubre de 2026).
 */
export async function encolarVarios(opciones: {
  fuente: string;
  tipo: TipoTrabajo;
  referencias: string[];
  prioridad?: number;
  ejecutarTras?: Date;
  /** Por defecto "adelantar". Ver SQL_ENCOLAR. */
  modo?: ModoEncolado;
}): Promise<void> {
  const sql = SQL_ENCOLAR[opciones.modo ?? "adelantar"];
  const unicas = [...new Set(opciones.referencias)];
  for (let i = 0; i < unicas.length; i += TANDA_ENCOLADO) {
    await consultar(sql, [
      opciones.fuente, opciones.tipo, unicas.slice(i, i + TANDA_ENCOLADO),
      opciones.prioridad ?? 100, opciones.ejecutarTras ?? new Date(),
    ]);
  }
}

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
  if (opciones.referencia == null) {
    // Sin referencia (el descubrimiento) no hay con que chocar: dos nulos no
    // son iguales para la restriccion de unicidad, asi que es un insert.
    await consultar(
      `insert into trabajo (fuente, tipo, referencia, prioridad, ejecutar_tras)
       values ($1, $2, null, $3, $4)`,
      [opciones.fuente, opciones.tipo, opciones.prioridad ?? 100, opciones.ejecutarTras ?? new Date()],
    );
    return;
  }
  await encolarVarios({ ...opciones, referencias: [opciones.referencia] });
}

/**
 * Toma hasta `cuantos` trabajos listos, los mas urgentes primero. Con `tipos`
 * solo de esos tipos: es lo que permite reservar sitio en cada lote para las
 * fichas nuevas (ver `repartirLote` en src/ingesta/planificador.ts). Misma
 * toma que tomar_trabajos en db/003_ingesta.sql, con el filtro de tipo; el
 * `for update skip locked` es lo que deja correr varios workers a la vez.
 */
export async function tomar(fuente: string, cuantos: number, tipos?: TipoTrabajo[]): Promise<Trabajo[]> {
  if (cuantos <= 0) return [];
  if (!tipos) return consultar<Trabajo>(`select * from tomar_trabajos($1, $2)`, [fuente, cuantos]);
  return consultar<Trabajo>(
    `update trabajo t
     set estado = 'ejecutando', actualizado = now(), intentos = t.intentos + 1
     where t.id in (
       select id from trabajo
       where fuente = $1 and estado = 'pendiente' and ejecutar_tras <= now()
         and tipo = any($3::trabajo_tipo[])
       order by prioridad, ejecutar_tras
       limit $2
       for update skip locked
     )
     returning t.*`,
    [fuente, cuantos, tipos],
  );
}

/** Cuantos trabajos de cada tipo estan listos para tomarse ahora mismo. */
export async function pendientesPorTipo(fuente: string): Promise<Partial<Record<TipoTrabajo, number>>> {
  const filas = await consultar<{ tipo: TipoTrabajo; n: number }>(
    `select tipo::text as tipo, count(*)::int as n from trabajo
     where fuente = $1 and estado = 'pendiente' and ejecutar_tras <= now()
     group by tipo`,
    [fuente],
  );
  const r: Partial<Record<TipoTrabajo, number>> = {};
  for (const f of filas) r[f.tipo] = f.n;
  return r;
}

/**
 * Devuelve a la cola, tal cual estaba, un trabajo que se tomo y no se llego a
 * empezar porque se agoto el tiempo de la pasada. No es culpa del trabajo,
 * asi que no cuenta como intento: si contara, un refresco que cae cinco
 * pasadas seguidas al final del lote acabaria en 'fallido' sin haber fallado.
 */
export async function devolver(id: number): Promise<void> {
  await consultar(
    `update trabajo set estado = 'pendiente', intentos = greatest(intentos - 1, 0),
            actualizado = now()
     where id = $1 and estado = 'ejecutando'`,
    [id],
  );
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
  if (piezas.length === 0) return;
  const hashes = piezas.map((pieza) =>
    createHash("sha256").update(`${pieza.etiqueta}\u0000${pieza.contenido}`).digest("hex"));
  // Todas las pestañas de la ficha en una sola sentencia. Si el contenido no
  // ha cambiado no se duplica la fila: solo interesa guardar versiones
  // distintas.
  await consultar(
    `insert into contenido_crudo (fuente, id_externo, tipo_mime, hash, contenido)
     select $1::text, $2::text, m, h, c
     from unnest($3::text[], $4::text[], $5::text[]) as piezas(m, h, c)
     on conflict (fuente, id_externo, hash) do nothing`,
    [fuente, idExterno, piezas.map((p) => p.tipoMime ?? "text/html"), hashes,
     piezas.map((p) => p.contenido)],
  );
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
