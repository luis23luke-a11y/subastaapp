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
// Reparto de cada lote de trabajos entre fichas nuevas y todo lo demas.
//
// La cola se toma por prioridad, y el refresco de lo que cierra hoy tiene
// prioridad 10 frente al 100 de una ficha nueva. Con una subasta que cierra
// hoy eso es lo que se quiere; con doscientas, la pasada entera se va en
// refrescarlas y las mil fichas que faltan por bajar no avanzan (medido el
// 26 de octubre de 2026: 36 actualizadas, 0 nuevas, 999 pendientes). Por eso
// cada lote reserva sitio para fichas nuevas: se toman primero hasta la mitad
// del lote en trabajos "detalle", y el resto del lote va por prioridad, sea
// del tipo que sea. Sin fichas nuevas pendientes, el lote entero va por
// prioridad. Asi una pasada nunca se va entera en refrescos mientras quede
// algo por bajar, y lo que cierra hoy sigue teniendo al menos medio lote.
// ---------------------------------------------------------------------------

export interface RepartoLote {
  /** Trabajos "detalle" que se toman aparte, antes que la prioridad. */
  nuevas: number;
  /** Huecos que quedan para lo mas urgente de cualquier tipo. */
  libres: number;
  motivo: string;
}

export function repartirLote(
  cuantos: number,
  pendientes: { detalle?: number },
  fraccionNuevas = 0.5,
): RepartoLote {
  const tamano = Math.max(0, Math.floor(cuantos));
  const sinBajar = Math.max(0, pendientes.detalle ?? 0);
  if (tamano === 0 || sinBajar === 0) {
    return { nuevas: 0, libres: tamano, motivo: "No hay fichas nuevas: el lote entero va por prioridad" };
  }
  const reserva = Math.min(tamano, Math.ceil(tamano * fraccionNuevas));
  const nuevas = Math.min(reserva, sinBajar);
  return {
    nuevas,
    libres: tamano - nuevas,
    motivo: `${nuevas} de ${tamano} reservados para fichas nuevas (${sinBajar} sin bajar)`,
  };
}

/**
 * Orden en que se atiende un lote: alternando lo urgente y lo nuevo, para
 * que si la pasada se agota a mitad de lote no se queden fuera siempre los
 * mismos. Lo que sobra de la lista mas larga va al final.
 */
export function intercalar<T>(urgentes: T[], nuevas: T[]): T[] {
  const r: T[] = [];
  const n = Math.max(urgentes.length, nuevas.length);
  for (let i = 0; i < n; i++) {
    const u = urgentes[i];
    const v = nuevas[i];
    if (u !== undefined) r.push(u);
    if (v !== undefined) r.push(v);
  }
  return r;
}
