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
