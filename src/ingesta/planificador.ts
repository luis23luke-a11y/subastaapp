// ---------------------------------------------------------------------------
// Decisiones de ritmo de la ingesta. Funciones puras, sin base de datos ni
// reloj propio, para poder probarlas (tests/planificador.test.ts).
// ---------------------------------------------------------------------------

export interface PlanRefresco {
  /** Cuando volver a mirar este lote. null = no hay que volver. */
  proxima: Date | null;
  /** Menor es antes. Lo que cierra hoy adelanta a todo lo demas. */
  prioridad: number;
  motivo: string;
}

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

/**
 * Cada cuanto mirar una subasta segun lo que le queda para cerrar.
 *
 * El criterio: una subasta que cierra dentro de un mes no cambia casi nunca,
 * y una que cierra hoy cambia cada pocos minutos. Refrescar todo al mismo
 * ritmo significa o machacar la fuente o llegar tarde al unico momento que
 * importa.
 */
export function planificarRefresco(
  fechaFin: Date | null,
  estado: string,
  ahora: Date = new Date(),
): PlanRefresco {
  if (estado === "cancelada" || estado === "suspendida") {
    return { proxima: null, prioridad: 900, motivo: "La subasta ya no sigue su curso" };
  }

  if (!fechaFin) {
    return {
      proxima: new Date(ahora.getTime() + 24 * HORA),
      prioridad: 500,
      motivo: "Sin fecha de cierre: se mira una vez al dia",
    };
  }

  const msRestantes = fechaFin.getTime() - ahora.getTime();

  if (msRestantes <= 0) {
    // Ya cerro. Una ultima pasada al dia siguiente para recoger el estado
    // final, y despues se deja en paz.
    const horasPasadas = -msRestantes / HORA;
    if (horasPasadas < 48) {
      return {
        proxima: new Date(ahora.getTime() + 6 * HORA),
        prioridad: 300,
        motivo: "Recien cerrada: se recoge el estado final",
      };
    }
    return { proxima: null, prioridad: 900, motivo: "Cerrada hace mas de dos dias" };
  }

  if (msRestantes <= 24 * HORA) {
    return {
      proxima: new Date(ahora.getTime() + 15 * MINUTO),
      prioridad: 10,
      motivo: "Cierra en menos de un dia",
    };
  }

  if (msRestantes <= 7 * 24 * HORA) {
    return {
      proxima: new Date(ahora.getTime() + 6 * HORA),
      prioridad: 50,
      motivo: "Cierra esta semana",
    };
  }

  return {
    proxima: new Date(ahora.getTime() + 24 * HORA),
    prioridad: 200,
    motivo: "Queda mas de una semana",
  };
}

/**
 * Espera antes de reintentar un trabajo que ha fallado: exponencial con tope y
 * con ruido. El ruido evita que mil trabajos que fallaron a la vez por una
 * caida de la fuente vuelvan todos juntos en el mismo segundo.
 */
export function esperaReintento(
  intentos: number,
  baseMs = 30_000,
  topeMs = 2 * HORA,
  ruido: () => number = Math.random,
): number {
  const exponencial = Math.min(baseMs * 2 ** Math.max(0, intentos - 1), topeMs);
  return Math.round(exponencial * (0.75 + ruido() * 0.5));
}

/**
 * Cuanto debe esperar una pasada que se ha quedado sin trabajo tomable. Si
 * hay un trabajo programado que vence antes de que se agote el tope de la
 * pasada, se espera a el (con un margen por los relojes de la base y del
 * runner); si no hay ninguno o vence despues del tope, null: la pasada acaba.
 *
 * Sin esto, con la cola al dia cada pasada terminaba en segundos y lanzaba la
 * siguiente a los dos minutos para no hacer nada: medido el 27/10/2026,
 * pasadas a las 17:00, 17:02, 17:04 y 17:06 con cero o cinco trabajos.
 */
export function esperaHastaVencimiento(
  proximo: Date | null,
  ahora: number,
  limite: number,
  margenMs = 2_000,
): number | null {
  if (!proximo) return null;
  const hasta = proximo.getTime() + margenMs;
  if (hasta >= limite) return null;
  return Math.max(0, hasta - ahora);
}

/** Un error de red o un 5xx se reintenta; un 404 o un 403 no. */
export function merecePena(error: unknown): boolean {
  const mensaje = error instanceof Error ? error.message : String(error);
  if (/\b(404|403|401|410)\b/.test(mensaje)) return false;
  if (/no existe|not found|prohibido|forbidden/i.test(mensaje)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Que pasa al encolar un trabajo que ya estaba en la cola.
//
// La cola no admite dos filas para la misma subasta y el mismo tipo de trabajo
// (db/003_ingesta.sql), asi que encolar algo que ya existe es siempre una
// fusion con la fila vieja. Hay dos intenciones distintas detras de un
// "encolar", y confundirlas costo una pasada entera en produccion (24 de
// octubre de 2026): el descubrimiento devolvia a "pendiente" las fichas ya
// bajadas con su fecha original, que era la mas antigua de la cola, y cada
// pasada volvia a bajar las mismas 34 fichas en vez de avanzar.
//
//   adelantar  "esto hay que hacerlo, si no esta hecho ya". Es lo que hace el
//              descubrimiento con cada ficha y el detalle con cada bien por
//              enriquecer. Un trabajo hecho no se toca (del refresco se ocupa
//              el trabajo "refrescar", no el descubrimiento); uno en marcha
//              tampoco; uno pendiente se queda con la fecha y la prioridad mas
//              tempranas de las dos; uno fallido vuelve a intentarse de cero.
//
//   programar  "la proxima vez es esta". Es lo que hace un refresco al
//              reprogramarse: la fecha y la prioridad nuevas mandan, aunque la
//              fila este hecha, fallida o siendo ejecutada por este mismo
//              trabajo. Si ganase la fecha vieja, como pasaba con least(),
//              una subasta recien cerrada se refrescaria una sola vez en lugar
//              de cada seis horas durante dos dias.
//
// La consulta SQL de `encolar` en src/ingesta/cola.ts aplica esta misma tabla;
// esta funcion existe para poder probarla sin base de datos
// (tests/planificador.test.ts). Si se cambia una hay que cambiar la otra.
// ---------------------------------------------------------------------------

export type ModoEncolado = "adelantar" | "programar";
export type EstadoTrabajo = "pendiente" | "ejecutando" | "hecho" | "fallido";

export interface FilaEnCola {
  estado: EstadoTrabajo;
  prioridad: number;
  ejecutarTras: Date;
  intentos: number;
}

export interface PeticionEncolar {
  prioridad: number;
  ejecutarTras: Date;
}

/**
 * Como queda la fila tras encolar. `null` significa que la fila existente no
 * se toca. Sin fila existente, el resultado es la fila nueva tal cual.
 */
export function fusionarEncolado(
  existente: FilaEnCola | null,
  nueva: PeticionEncolar,
  modo: ModoEncolado,
): FilaEnCola | null {
  if (existente === null || modo === "programar") {
    return { estado: "pendiente", prioridad: nueva.prioridad, ejecutarTras: nueva.ejecutarTras, intentos: 0 };
  }
  if (existente.estado === "hecho" || existente.estado === "ejecutando") return null;
  return {
    estado: "pendiente",
    prioridad: Math.min(existente.prioridad, nueva.prioridad),
    ejecutarTras: new Date(Math.min(existente.ejecutarTras.getTime(), nueva.ejecutarTras.getTime())),
    intentos: existente.estado === "fallido" ? 0 : existente.intentos,
  };
}

// ---------------------------------------------------------------------------
// Reparto de cada lote de trabajos entre fichas nuevas, bienes por enriquecer
// y todo lo demas.
//
// La cola se toma por prioridad, y el refresco de lo que cierra hoy tiene
// prioridad 10 frente al 100 de una ficha nueva y al 400 de un bien por
// enriquecer. Con una subasta que cierra hoy eso es lo que se quiere; con
// doscientas, la pasada entera se va en refrescarlas y las mil fichas que
// faltan por bajar no avanzan (medido el 26 de octubre de 2026: 36
// actualizadas, 0 nuevas, 999 pendientes). Y el enriquecimiento, con la
// prioridad mas baja de todas, no llegaba nunca: 1.559 bienes reales y
// ninguno localizado al cabo de dos dias de pasadas, porque los refrescos se
// reprograman a si mismos sin fin y siempre hay alguno listo antes que el.
//
// Por eso cada lote reserva sitio por tipo, en este orden: hasta la mitad del
// lote para trabajos "detalle" mientras haya fichas sin bajar, hasta un
// cuarto para "enriquecer" mientras haya bienes por enriquecer, y lo que
// queda va por prioridad, sea del tipo que sea. Un hueco reservado que no se
// llena (quedan tres fichas, no cinco) vuelve a lo urgente. Asi una pasada
// nunca se va entera en refrescos mientras quede algo por bajar o por
// localizar, y lo que cierra hoy sigue teniendo al menos un cuarto del lote.
//
// Por que un cuarto y no mas: enriquecer un bien son una a tres consultas al
// Catastro a 350 ms, mucho menos que una ficha nueva (cuatro o cinco paginas
// del portal a segundo y medio), asi que cinco por lote de veinte dan varias
// decenas por pasada sin quitarle al portal casi nada de tiempo.
// ---------------------------------------------------------------------------

export interface RepartoLote {
  /** Trabajos "detalle" que se toman aparte, antes que la prioridad. */
  nuevas: number;
  /** Trabajos "enriquecer" que se toman aparte, antes que la prioridad. */
  enriquecer: number;
  /** Huecos que quedan para lo mas urgente de cualquier tipo. */
  libres: number;
  motivo: string;
}

export interface FraccionesLote {
  /** Parte del lote reservada a fichas nuevas. Por defecto la mitad. */
  nuevas?: number;
  /** Parte del lote reservada a bienes por enriquecer. Por defecto un cuarto. */
  enriquecer?: number;
}

export function repartirLote(
  cuantos: number,
  pendientes: { detalle?: number; enriquecer?: number },
  fracciones: FraccionesLote = {},
): RepartoLote {
  const tamano = Math.max(0, Math.floor(cuantos));
  const sinBajar = Math.max(0, pendientes.detalle ?? 0);
  const sinEnriquecer = Math.max(0, pendientes.enriquecer ?? 0);

  // La reserva de fichas redondea hacia arriba (con lote impar, la ficha nueva
  // gana); la de enriquecer, hacia abajo, para que en un lote pequeño siempre
  // quede algun hueco para lo urgente.
  const nuevas = Math.min(sinBajar, Math.ceil(tamano * (fracciones.nuevas ?? 0.5)));
  const enriquecer = Math.min(
    sinEnriquecer, Math.floor(tamano * (fracciones.enriquecer ?? 0.25)), tamano - nuevas,
  );
  const libres = tamano - nuevas - enriquecer;

  const partes: string[] = [];
  if (nuevas > 0) partes.push(`${nuevas} para fichas nuevas (${sinBajar} sin bajar)`);
  if (enriquecer > 0) partes.push(`${enriquecer} para enriquecer (${sinEnriquecer} bienes pendientes)`);
  const motivo = partes.length === 0
    ? "Nada que bajar ni que enriquecer: el lote entero va por prioridad"
    : `De ${tamano}: ${partes.join(", ")}; ${libres} por prioridad`;
  return { nuevas, enriquecer, libres, motivo };
}

/**
 * Orden en que se atiende un lote: alternando una de cada lista (lo urgente,
 * lo nuevo, lo que hay que enriquecer), para que si la pasada se agota a
 * mitad de lote no se queden fuera siempre los mismos. Lo que sobra de las
 * listas mas largas va al final.
 */
export function intercalar<T>(...listas: T[][]): T[] {
  const r: T[] = [];
  const n = Math.max(0, ...listas.map((l) => l.length));
  for (let i = 0; i < n; i++) {
    for (const lista of listas) {
      const v = lista[i];
      if (v !== undefined) r.push(v);
    }
  }
  return r;
}
