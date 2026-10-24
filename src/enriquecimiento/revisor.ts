// ---------------------------------------------------------------------------
// Revisor con modelo de lenguaje para los casos que las reglas no resuelven.
//
// El orden importa y es deliberado: primero las reglas, que son auditables,
// gratuitas y pueden explicar por que dijeron lo que dijeron; el modelo solo
// cuando quedan por debajo del umbral. Al reves saldria caro y, peor, seria
// imposible depurar un fallo concreto.
//
// El cliente es enchufable: aqui no se habla con ningun proveedor concreto.
// La validacion de la salida vive en este fichero y se aplica venga de donde
// venga, porque un modelo puede devolver cualquier cosa.
// ---------------------------------------------------------------------------

import { SITUACIONES, type Situacion } from "@/lib/tipos";
import type { Extraccion } from "@/enriquecimiento/extraer";

export interface RespuestaModelo {
  cargasSubsisten: boolean | null;
  cargasImporte: number | null;
  situacion: Situacion;
  viviendaHabitual: boolean | null;
  confianza: number;
  cargasEvidencia: string | null;
  situacionEvidencia: string | null;
}

/** Lo unico que el revisor necesita de un proveedor de modelo. */
export interface ClienteModelo {
  readonly nombre: string;
  completar(instruccion: string, texto: string): Promise<string>;
}

export const INSTRUCCION = `Eres un asistente que lee anuncios de subastas judiciales españolas y extrae datos estructurados.

Reglas que debes respetar:
- Las cargas ANTERIORES al crédito del ejecutante subsisten tras la adjudicación; las POSTERIORES se cancelan. Solo las anteriores cuentan.
- La fórmula "las cargas y gravámenes anteriores y los preferentes, SI LOS HUBIERE, continuarán subsistentes" es obligatoria por ley y aparece en casi todos los anuncios. Por sí sola NO indica que existan cargas: en ese caso cargasSubsisten es null.
- No saber no es lo mismo que saber que no. Si el texto no lo dice, devuelve null o "desconocido".
- Toda evidencia debe ser una cita LITERAL del texto, copiada sin cambiar una palabra. Si no puedes citar, devuelve null.

Responde SOLO con un objeto JSON con estas claves exactas:
{"cargasSubsisten": true|false|null, "cargasImporte": número|null, "situacion": "ocupado"|"libre"|"desconocido", "viviendaHabitual": true|false|null, "confianza": 0..1, "cargasEvidencia": "cita literal"|null, "situacionEvidencia": "cita literal"|null}`;

/** Valida la respuesta del modelo. Todo lo que no encaje se descarta: mas vale
 *  quedarse con lo que dijeron las reglas que meter un dato inventado. */
export function validarRespuesta(crudo: string, textoOriginal: string): RespuestaModelo | null {
  const json = /\{[\s\S]*\}/.exec(crudo);
  if (!json) return null;

  let datos: Record<string, unknown>;
  try {
    datos = JSON.parse(json[0]) as Record<string, unknown>;
  } catch {
    return null;
  }

  const booleano = (v: unknown): boolean | null =>
    v === true || v === false ? v : null;

  const situacion = typeof datos["situacion"] === "string" &&
    (SITUACIONES as readonly string[]).includes(datos["situacion"])
    ? (datos["situacion"] as Situacion)
    : "desconocido";

  const importe = typeof datos["cargasImporte"] === "number" &&
    Number.isFinite(datos["cargasImporte"]) && datos["cargasImporte"] >= 0
    ? datos["cargasImporte"]
    : null;

  const confianzaCruda = typeof datos["confianza"] === "number" ? datos["confianza"] : 0;
  const confianza = Math.max(0, Math.min(1, confianzaCruda));

  // Una cita que no esta en el texto es una invencion: se tira.
  const citar = (v: unknown): string | null => {
    if (typeof v !== "string" || !v.trim()) return null;
    return textoOriginal.includes(v.trim()) ? v.trim() : null;
  };

  return {
    cargasSubsisten: booleano(datos["cargasSubsisten"]),
    cargasImporte: importe,
    situacion,
    viviendaHabitual: booleano(datos["viviendaHabitual"]),
    confianza,
    cargasEvidencia: citar(datos["cargasEvidencia"]),
    situacionEvidencia: citar(datos["situacionEvidencia"]),
  };
}

export interface ResultadoRevision {
  extraccion: Extraccion;
  origen: "reglas" | "modelo";
  motivo: string;
}

/**
 * Mezcla lo que dijeron las reglas con lo que dice el modelo. El modelo solo
 * pisa un campo si las reglas no lo resolvieron o si va mas seguro Y puede
 * citar el texto. Una afirmacion sin cita no pisa nada.
 */
export async function revisar(
  previa: Extraccion,
  texto: string,
  cliente: ClienteModelo | null,
): Promise<ResultadoRevision> {
  if (!previa.necesitaRevision) {
    return { extraccion: previa, origen: "reglas", motivo: "Las reglas resolvieron el anuncio" };
  }
  if (!cliente) {
    return { extraccion: previa, origen: "reglas", motivo: "Sin modelo configurado: queda la extracción por reglas" };
  }

  let respuesta: RespuestaModelo | null = null;
  try {
    respuesta = validarRespuesta(await cliente.completar(INSTRUCCION, texto), texto);
  } catch {
    return { extraccion: previa, origen: "reglas", motivo: "El modelo falló: se conserva la extracción por reglas" };
  }
  if (!respuesta) {
    return { extraccion: previa, origen: "reglas", motivo: "Respuesta del modelo no válida" };
  }

  const mezclada: Extraccion = { ...previa };
  let pisados = 0;

  if (respuesta.cargasEvidencia &&
      (previa.cargasSubsisten.valor === null || respuesta.confianza > previa.cargasSubsisten.confianza)) {
    mezclada.cargasSubsisten = {
      valor: respuesta.cargasSubsisten, confianza: respuesta.confianza,
      evidencia: respuesta.cargasEvidencia, regla: `modelo:${cliente.nombre}`,
    };
    if (respuesta.cargasImporte != null) {
      mezclada.cargasImporte = {
        valor: respuesta.cargasImporte, confianza: respuesta.confianza,
        evidencia: respuesta.cargasEvidencia, regla: `modelo:${cliente.nombre}`,
      };
    }
    pisados++;
  }

  if (respuesta.situacionEvidencia &&
      (previa.situacion.confianza === 0 || respuesta.confianza > previa.situacion.confianza)) {
    mezclada.situacion = {
      valor: respuesta.situacion, confianza: respuesta.confianza,
      evidencia: respuesta.situacionEvidencia, regla: `modelo:${cliente.nombre}`,
    };
    pisados++;
  }

  if (previa.viviendaHabitual.valor === null && respuesta.viviendaHabitual !== null) {
    mezclada.viviendaHabitual = {
      valor: respuesta.viviendaHabitual, confianza: respuesta.confianza,
      evidencia: null, regla: `modelo:${cliente.nombre}`,
    };
  }

  mezclada.confianzaGlobal = Math.min(mezclada.cargasSubsisten.confianza, mezclada.situacion.confianza);
  mezclada.necesitaRevision = false;

  return {
    extraccion: mezclada,
    origen: pisados > 0 ? "modelo" : "reglas",
    motivo: pisados > 0
      ? `El modelo resolvió ${pisados} campo${pisados === 1 ? "" : "s"} con cita del texto`
      : "El modelo no aportó nada citable",
  };
}
