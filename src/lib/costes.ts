// ---------------------------------------------------------------------------
// Motor de costes y margen.
//
// Responde a la unica pregunta que importa: cuanto me cuesta de verdad quedarme
// con esto, y cuanto margen queda contra el valor de mercado.
//
// Todo son funciones puras para poder probarlas (ver tests/costes.test.js).
// Ningun numero esta cableado en la interfaz: los supuestos entran por
// parametro y la ficha los muestra para que el usuario los cambie.
//
// Es una estimacion informativa. No es asesoramiento juridico ni fiscal.
// ---------------------------------------------------------------------------

import { tipoItp } from "@/datos/itp";
import type { Situacion, TipoBien, TipoSubasta } from "@/lib/tipos";

/** Reglas de la subasta por tipo. Configurables porque cambian con cada
 *  reforma procesal: no deben vivir dentro de la logica de calculo. */
export interface ReglasPuja {
  /** Porcentaje del valor de subasta que hay que consignar para pujar. */
  deposito: number;
  /** Umbral, sobre el valor de subasta, a partir del cual el remate se
   *  aprueba sin mas tramite. Por debajo hay trámite adicional. */
  umbralAprobacion: number;
  nota: string;
}

export const REGLAS: Record<TipoSubasta, ReglasPuja> = {
  judicial: {
    deposito: 0.05, umbralAprobacion: 0.70,
    nota: "Depósito del 5% del valor de subasta. Por debajo del 70% el remate no se aprueba de forma automática.",
  },
  concursal: {
    deposito: 0.05, umbralAprobacion: 0.70,
    nota: "Sujeta al plan de liquidación del concurso, que puede fijar otras condiciones.",
  },
  aeat: {
    deposito: 0.05, umbralAprobacion: 0.50,
    nota: "Depósito del 5%. Las condiciones las fija el anuncio de la dependencia de recaudación.",
  },
  seguridad_social: {
    deposito: 0.05, umbralAprobacion: 0.50,
    nota: "Condiciones fijadas por la unidad de recaudación ejecutiva.",
  },
  notarial: {
    deposito: 0.05, umbralAprobacion: 0.70,
    nota: "Venta extrajudicial ante notario. Condiciones según el acta.",
  },
  otra: {
    deposito: 0.05, umbralAprobacion: 0.70,
    nota: "Reglas por defecto. Revisar el anuncio original.",
  },
};

export interface Supuestos {
  /** Coste de reforma por metro construido. */
  reformaPorM2: number;
  /** Coste estimado de recuperar la posesión si el inmueble está ocupado. */
  costeDesalojo: number;
  /** Lo mismo cuando no sabemos si está ocupado: se asume la mitad. */
  factorDesalojoIncierto: number;
  /** Comisión de venta si el plan es revender. 0 si te lo quedas. */
  comisionVenta: number;
  ibiPendiente: number;
  derramasPendientes: number;
}

export const SUPUESTOS_POR_DEFECTO: Supuestos = {
  reformaPorM2: 350,
  costeDesalojo: 6000,
  factorDesalojoIncierto: 0.5,
  comisionVenta: 0,
  ibiPendiente: 0,
  derramasPendientes: 0,
};

export interface EntradaCostes {
  puja: number;
  comunidad?: string | null;
  tipoSubasta?: TipoSubasta;
  tipoBien?: TipoBien | null;
  /** Cargas anteriores que subsisten tras la adjudicación. */
  cargasSubsisten?: number | null;
  situacion?: Situacion;
  m2?: number | null;
  valorMercado?: number | null;
  cuotaPropiedad?: number | null;
  supuestos?: Partial<Supuestos>;
}

export interface Partida {
  concepto: string;
  importe: number;
  /** false cuando la cifra es un supuesto nuestro y no un dato. */
  estimado: boolean;
  nota?: string;
}

export interface ResultadoCostes {
  partidas: Partida[];
  costeTotal: number;
  deposito: number;
  valorMercado: number | null;
  /** Valor de mercado ajustado por la cuota de propiedad del lote. */
  valorMercadoAjustado: number | null;
  margen: number | null;
  margenPct: number | null;
  reglas: ReglasPuja;
  avisos: string[];
}

/** Aranceles de notaría. Aproximación por tramos sobre el valor escriturado;
 *  el arancel real es una escala con minimos y suplidos. Orientativo. */
export function honorariosNotaria(valor: number): number {
  if (valor <= 0) return 0;
  const base = 350 + valor * 0.0012;
  return Math.round(Math.min(Math.max(base, 400), 3000));
}

/** Aranceles del registro de la propiedad. Misma advertencia. */
export function honorariosRegistro(valor: number): number {
  if (valor <= 0) return 0;
  const base = 200 + valor * 0.0008;
  return Math.round(Math.min(Math.max(base, 250), 2200));
}

export function calcularCostes(entrada: EntradaCostes): ResultadoCostes {
  const sup: Supuestos = { ...SUPUESTOS_POR_DEFECTO, ...(entrada.supuestos ?? {}) };
  const reglas = REGLAS[entrada.tipoSubasta ?? "judicial"];
  const puja = Math.max(0, entrada.puja);
  const avisos: string[] = [];
  const partidas: Partida[] = [];

  partidas.push({ concepto: "Puja", importe: puja, estimado: false });

  const itp = tipoItp(entrada.comunidad);
  partidas.push({
    concepto: `ITP (${(itp.tipoGeneral * 100).toLocaleString("es-ES")}% · ${itp.comunidad})`,
    importe: Math.round(puja * itp.tipoGeneral),
    estimado: true,
    nota: itp.nota ?? "Tipo general de la comunidad, sin reducciones aplicadas.",
  });
  if (!itp.verificado) {
    avisos.push("El tipo de ITP no está verificado: compruébalo antes de decidir.");
  }

  partidas.push({ concepto: "Notaría", importe: honorariosNotaria(puja), estimado: true });
  partidas.push({ concepto: "Registro de la propiedad", importe: honorariosRegistro(puja), estimado: true });

  const cargas = entrada.cargasSubsisten ?? 0;
  if (cargas > 0) {
    partidas.push({
      concepto: "Cargas anteriores que subsisten",
      importe: cargas, estimado: true,
      nota: "Extraído del texto del anuncio. Verifícalo en la nota simple del registro.",
    });
  } else if (entrada.cargasSubsisten == null) {
    avisos.push("No sabemos si quedan cargas anteriores. Es el riesgo más caro de una subasta: pide nota simple.");
  }

  if (sup.ibiPendiente > 0) {
    partidas.push({ concepto: "IBI pendiente", importe: sup.ibiPendiente, estimado: true });
  }
  if (sup.derramasPendientes > 0) {
    partidas.push({ concepto: "Derramas pendientes", importe: sup.derramasPendientes, estimado: true });
  }

  const situacion: Situacion = entrada.situacion ?? "desconocido";
  if (situacion === "ocupado") {
    partidas.push({
      concepto: "Recuperación de la posesión", importe: sup.costeDesalojo, estimado: true,
      nota: "El anuncio dice que está ocupado. El plazo real puede ser de muchos meses.",
    });
    avisos.push("Inmueble ocupado: el coste y, sobre todo, el plazo de desalojo son el mayor riesgo del lote.");
  } else if (situacion === "desconocido") {
    partidas.push({
      concepto: "Posible desalojo (situación sin determinar)",
      importe: Math.round(sup.costeDesalojo * sup.factorDesalojoIncierto),
      estimado: true,
      nota: "No consta la situación posesoria: se provisiona la mitad del coste de desalojo.",
    });
  }

  const m2 = entrada.m2 ?? null;
  if (m2 && m2 > 0 && sup.reformaPorM2 > 0) {
    partidas.push({
      concepto: `Reforma (${m2.toLocaleString("es-ES")} m² × ${sup.reformaPorM2} €)`,
      importe: Math.round(m2 * sup.reformaPorM2), estimado: true,
    });
  } else if (sup.reformaPorM2 > 0) {
    avisos.push("Sin superficie conocida no se puede estimar la reforma.");
  }

  const costeTotal = partidas.reduce((s, p) => s + p.importe, 0);

  const cuota = entrada.cuotaPropiedad ?? 1;
  if (cuota < 1) {
    avisos.push(`El lote es una cuota del ${(cuota * 100).toLocaleString("es-ES")}% del pleno dominio, no el inmueble completo.`);
  }

  const valorMercado = entrada.valorMercado ?? null;
  const valorMercadoAjustado = valorMercado == null ? null : Math.round(valorMercado * cuota);

  let valorNeto = valorMercadoAjustado;
  if (valorNeto != null && sup.comisionVenta > 0) {
    valorNeto = Math.round(valorNeto * (1 - sup.comisionVenta));
  }

  const margen = valorNeto == null ? null : valorNeto - costeTotal;
  const margenPct = valorNeto == null || valorNeto <= 0 ? null : (margen as number) / valorNeto;

  if (valorMercado == null) {
    avisos.push("Sin valor de mercado estimado no hay margen que calcular.");
  }

  return {
    partidas, costeTotal,
    deposito: Math.round(puja * reglas.deposito),
    valorMercado, valorMercadoAjustado,
    margen, margenPct, reglas, avisos,
  };
}
