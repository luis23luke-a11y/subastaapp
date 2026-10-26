// ---------------------------------------------------------------------------
// El worker. Tres trabajos sobre una sola cola:
//
//   descubrir  pregunta a la fuente que subastas hay nuevas y encola un
//              "detalle" por cada una.
//   detalle    baja una subasta, guarda el crudo, la normaliza y se programa
//              su primer refresco.
//   refrescar  vuelve a mirar una subasta que sigue viva y se reprograma a si
//              misma segun lo cerca que este de cerrar.
//   enriquecer localiza un bien en el Catastro, saca su superficie y su uso y
//              lo valora. Va aparte porque pega a otro servicio, con su propio
//              ritmo, y un fallo suyo no debe tumbar la ingesta.
//
// Un solo hilo y un limitador de ritmo. Varios workers pueden correr a la vez
// sin pisarse porque la toma de trabajos usa `for update skip locked`.
// ---------------------------------------------------------------------------

import { crearLimitador } from "@/ingesta/limitador";
import { intercalar, planificarRefresco, repartirLote } from "@/ingesta/planificador";
import {
  abrirEjecucion, cerrarEjecucion, completar, devolver, encolar, encolarVarios,
  estadoCola, fallar, guardarCrudo, pendientesPorTipo, rescatar, tomar, type Trabajo,
} from "@/ingesta/cola";
import { guardarSubasta, refrescarSubasta } from "@/ingesta/normalizar";
import { bienesPendientes, enriquecerBien } from "@/enriquecimiento/enriquecer";
import type { Adaptador } from "@/ingesta/adaptador";

export interface OpcionesWorker {
  /** Desde cuando descubrir en el primer arranque. */
  desde?: Date;
  /** Tope de tiempo de la pasada, para poder correrlo desde un cron. */
  presupuestoMs?: number;
  /** Trabajos que se toman de la cola de una vez. */
  lote?: number;
  /** Encola un descubrimiento al empezar. */
  descubrir?: boolean;
  registrar?: (linea: string) => void;
}

export interface ResumenWorker {
  descubiertas: number;
  procesadas: number;
  nuevas: number;
  actualizadas: number;
  enriquecidos: number;
  fallidas: number;
  rendidas: number;
  peticiones: number;
  agotadoElTiempo: boolean;
}

export async function ejecutarWorker(
  adaptador: Adaptador,
  opciones: OpcionesWorker = {},
): Promise<ResumenWorker> {
  const {
    desde = new Date("2021-01-01"),
    presupuestoMs = 10 * 60_000,
    lote = 20,
    descubrir = true,
    registrar = (l: string) => console.info(l),
  } = opciones;

  const limitador = crearLimitador(adaptador.msEntrePeticiones);
  const limite = Date.now() + presupuestoMs;
  const r: ResumenWorker = {
    descubiertas: 0, procesadas: 0, nuevas: 0, actualizadas: 0, enriquecidos: 0,
    fallidas: 0, rendidas: 0, peticiones: 0, agotadoElTiempo: false,
  };

  const rescatados = await rescatar();
  if (rescatados > 0) registrar(`  ${rescatados} trabajos colgados devueltos a la cola`);

  const ejecucionId = await abrirEjecucion(adaptador.nombre);

  try {
    if (descubrir) {
      // Sin referencia nunca choca con el de la pasada anterior (dos nulos no
      // son iguales para la restriccion de unicidad), pero "programar" deja
      // claro que un descubrimiento se quiere ahora, este como este el viejo.
      await encolar({ fuente: adaptador.nombre, tipo: "descubrir", prioridad: 1, modo: "programar" });
    }

    while (Date.now() < limite) {
      // Cada lote reserva sitio para fichas nuevas; el resto va por prioridad.
      // La regla y el porque, en `repartirLote`.
      const reparto = repartirLote(lote, await pendientesPorTipo(adaptador.nombre));
      const nuevas = await tomar(adaptador.nombre, reparto.nuevas, ["detalle"]);
      const urgentes = await tomar(adaptador.nombre, reparto.libres);
      const trabajos = intercalar(urgentes, nuevas);
      if (trabajos.length === 0) break;

      for (const trabajo of trabajos) {
        if (Date.now() >= limite) {
          // No se pierde ni cuenta como intento: vuelve a la cola tal cual
          // para la siguiente pasada.
          await devolver(trabajo.id);
          r.agotadoElTiempo = true;
          continue;
        }
        try {
          await atender(adaptador, trabajo, { desde, limitador, resumen: r, registrar });
          await completar(trabajo.id);
        } catch (err) {
          r.fallidas++;
          const desenlace = await fallar(trabajo, err);
          if (desenlace === "rendido") r.rendidas++;
          registrar(`  fallo en ${trabajo.tipo} ${trabajo.referencia ?? ""}: ${(err as Error).message}`);
        }
      }
    }

    if (Date.now() >= limite) r.agotadoElTiempo = true;
    r.peticiones = limitador.hechas();
    await cerrarEjecucion(ejecucionId, r);
    return r;
  } catch (err) {
    r.peticiones = limitador.hechas();
    await cerrarEjecucion(ejecucionId, { ...r, error: (err as Error).message });
    throw err;
  }
}

interface Contexto {
  desde: Date;
  limitador: { turno(): Promise<void>; hechas(): number };
  resumen: ResumenWorker;
  registrar: (l: string) => void;
}

async function atender(adaptador: Adaptador, trabajo: Trabajo, ctx: Contexto): Promise<void> {
  if (trabajo.tipo === "descubrir") {
    await ctx.limitador.turno();
    // Modo "adelantar" (el de por defecto): una ficha ya bajada no se vuelve
    // a encolar; de volver a mirarla se ocupa su trabajo "refrescar". Se
    // encolan por tandas en una sola sentencia, no una a una: con 1.225
    // fichas, una ida y vuelta por cada una eran cuatro minutos de pasada.
    let tanda: string[] = [];
    const volcar = async () => {
      if (tanda.length === 0) return;
      await encolarVarios({ fuente: adaptador.nombre, tipo: "detalle", referencias: tanda, prioridad: 100 });
      ctx.resumen.descubiertas += tanda.length;
      tanda = [];
    };
    for await (const id of adaptador.descubrir(ctx.desde)) {
      tanda.push(id);
      if (tanda.length >= 500) await volcar();
    }
    await volcar();
    ctx.registrar(`  descubiertas ${ctx.resumen.descubiertas} subastas`);
    return;
  }

  if (trabajo.tipo === "enriquecer") {
    const bienId = Number.parseInt(trabajo.referencia ?? "", 10);
    if (!Number.isFinite(bienId)) throw new Error("Trabajo de enriquecimiento sin bien");
    // El Catastro tiene su propio limitador dentro del cliente: no se usa el
    // de la fuente de subastas, que mide otra cosa.
    const res = await enriquecerBien(bienId);
    if (res) ctx.resumen.enriquecidos++;
    return;
  }

  const id = trabajo.referencia;
  if (!id) throw new Error(`Trabajo ${trabajo.tipo} sin referencia`);

  // Un refresco solo necesita lo que cambia (estado, fechas, pujas), y la
  // fuente puede darlo con menos peticiones que la ficha entera. Si no lo
  // ofrece, o la subasta no estaba en la base, se baja entera.
  if (trabajo.tipo === "refrescar" && adaptador.detalleLigero) {
    const hecho = await refrescarLigero(adaptador, id, ctx);
    if (hecho) return;
  }
  await bajarEntera(adaptador, id, ctx);
}

/** Refresco en pocas peticiones. false si hay que bajar la ficha entera. */
async function refrescarLigero(adaptador: Adaptador, id: string, ctx: Contexto): Promise<boolean> {
  await ctx.limitador.turno();
  const resultado = await adaptador.detalleLigero!(id);
  if (!resultado) {
    ctx.registrar(`  ${id} ya no esta en el origen; se deja de refrescar`);
    return true;
  }
  if (resultado.crudo?.length) await guardarCrudo(adaptador.nombre, id, resultado.crudo);

  const guardado = await refrescarSubasta(adaptador.nombre, resultado.subasta);
  if (!guardado) return false;
  ctx.resumen.procesadas++;
  ctx.resumen.actualizadas++;
  await programarRefresco(adaptador, id, resultado.subasta.fechaFin ?? null, resultado.subasta.estado);
  return true;
}

/** La ficha entera: crudo, normalizacion, bienes por enriquecer y refresco. */
async function bajarEntera(adaptador: Adaptador, id: string, ctx: Contexto): Promise<void> {
  await ctx.limitador.turno();
  const resultado = await adaptador.detalle(id);

  if (!resultado) {
    // Desaparecio del origen. No se borra nada: lo que ya esta guardado se
    // queda, simplemente se deja de refrescar.
    ctx.registrar(`  ${id} ya no esta en el origen; se deja de refrescar`);
    return;
  }

  if (resultado.crudo?.length) {
    await guardarCrudo(adaptador.nombre, id, resultado.crudo);
  }

  const guardado = await guardarSubasta(adaptador.nombre, resultado.subasta);
  ctx.resumen.procesadas++;
  if (guardado.nueva) ctx.resumen.nuevas++;
  else ctx.resumen.actualizadas++;

  // Los bienes nuevos o aun sin localizar entran en la cola de enriquecimiento,
  // todos en una sentencia: eran hasta 50 idas y vueltas por ficha.
  const bienes = await bienesPendientes(50);
  if (bienes.length > 0) {
    await encolarVarios({
      fuente: adaptador.nombre, tipo: "enriquecer", referencias: bienes.map(String), prioridad: 400,
    });
  }

  await programarRefresco(adaptador, id, resultado.subasta.fechaFin ?? null, resultado.subasta.estado);
}

async function programarRefresco(
  adaptador: Adaptador, id: string, fechaFin: string | null, estado: string,
): Promise<void> {
  const plan = planificarRefresco(fechaFin ? new Date(fechaFin) : null, estado);
  if (!plan.proxima) return;
  // "programar": la fecha nueva manda. Cuando este trabajo es el propio
  // refresco, la fila que se actualiza es la suya, que esta en 'ejecutando';
  // queda en 'pendiente' para la fecha siguiente y `completar` ya no la toca.
  await encolar({
    fuente: adaptador.nombre, tipo: "refrescar", referencia: id,
    prioridad: plan.prioridad, ejecutarTras: plan.proxima, modo: "programar",
  });
}

export async function resumenCola(fuente: string): Promise<string> {
  const filas = await estadoCola(fuente);
  if (filas.length === 0) return "  cola vacia";
  return filas.map((f) => `  ${f.tipo.padEnd(10)} ${f.estado.padEnd(11)} ${f.n}`).join("\n");
}
