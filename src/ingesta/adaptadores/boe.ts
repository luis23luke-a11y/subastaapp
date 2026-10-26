// ---------------------------------------------------------------------------
// Adaptador del Portal de Subastas de la Agencia Estatal BOE (subastas.boe.es).
//
// Lee el portal como lo leeria una persona, despacio y sin sesion: una
// busqueda por estado para descubrir, y las pestañas de cada ficha para el
// detalle. Las condiciones de reutilizacion del BOE (resolucion de 27 de junio
// de 2024) permiten extraer y combinar sus documentos con fines comerciales a
// cambio de citar «Basado en datos de la Agencia Estatal Boletín Oficial del
// Estado»; la ficha y el buscador llevan esa cita. El robots.txt del portal
// pide a los programas que no entren, y eso es lo que un abogado tiene que
// conciliar con la licencia antes de cobrar al primer cliente.
//
// Lo que costo descubrir y conviene no volver a descubrir:
//
//   1. Sin sesion solo se pueden buscar tres estados: proxima apertura (PU),
//      celebrandose (EJ) y suspendida (SU). Concluidas, canceladas y
//      finalizadas devuelven cero resultados aunque existan. Por eso una
//      subasta "desaparece" del descubrimiento cuando concluye, pero su ficha
//      sigue existiendo y lo dice en la cabecera ("LA SUBASTA HA CONCLUIDO SU
//      PERIODO DE PUJAS"). Cuando el portal la retira del todo, la ficha
//      responde "ERROR: La subasta X no existe".
//   2. La ficha no tiene un campo "estado". El estado se deduce de las frases
//      de la cabecera y, si no hay ninguna, de las fechas: sin fecha de inicio
//      es proxima apertura; con fecha de conclusion futura, celebrandose. El
//      listado de busqueda si lo trae, y se guarda en memoria para no deducir
//      lo que el portal ya dijo.
//   3. Los importes de las pujas nunca son visibles sin sesion. El portal solo
//      dice "no ha recibido pujas", "ha recibido alguna puja" o "es secreta".
//      numPujas vale 0, 1 (al menos una) o null, respectivamente.
//   4. Con varios lotes, cada lote es una peticion aparte (ver=3&idLote=N) y
//      los importes de cada uno estan en su propia tabla; la general dice "ver
//      en cada lote".
//   5. Las pestañas son ver=1 (general), 2 (autoridad gestora), 3 (bienes) y
//      5 (pujas). La 4 y la 6 solo existen con sesion.
//   6. La paginacion del buscador es un enlace "Pág. siguiente" con un
//      id_busqueda opaco; no hay parametro de pagina que construir.
// ---------------------------------------------------------------------------

import { comunidadDeProvincia } from "@/datos/provincias";
import { importeEnCifras } from "@/enriquecimiento/importe";
import { crearLimitador } from "@/ingesta/limitador";
import type {
  Adaptador, BienBruto, Crudo, LoteBruto, ResultadoDetalle, ResultadoRefresco,
  SubastaBruta, SubastaRefrescada,
} from "@/ingesta/adaptador";
import type { Estado, Situacion, TipoBien, TipoSubasta } from "@/lib/tipos";

export const BASE_PORTAL = "https://subastas.boe.es";

/** Lo que devuelve una peticion. Se inyecta en las pruebas. */
export interface Obtenido {
  estado: number;
  cuerpo: string;
}
export type Obtener = (url: string) => Promise<Obtenido>;

/** Codigos de estado del formulario del portal visibles sin sesion. */
export type EstadoPortal = "PU" | "EJ" | "SU";

export interface OpcionesBOE {
  obtener?: Obtener;
  /** Estados que se recorren al descubrir. Por defecto, los tres publicos. */
  estados?: EstadoPortal[];
  /** Milisegundos entre peticiones. Es cortesia con un servicio publico. */
  msEntrePeticiones?: number;
  base?: string;
}

export class ErrorPortal extends Error {
  constructor(readonly status: number, url: string) {
    super(`HTTP ${status} en ${url}`);
    this.name = "ErrorPortal";
  }
}

// --- Utilidades de HTML --------------------------------------------------
// El portal es HTML de tablas sencillas; no hace falta un parser completo.

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ",
  uuml: "ü", Uuml: "Ü", euro: "€", ordf: "ª", ordm: "º",
};

export function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number.parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (todo, nombre: string) => ENTIDADES[nombre] ?? todo);
}

/** Quita etiquetas, decodifica entidades y compacta espacios. */
export function textoPlano(html: string): string {
  return decodificarEntidades(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Pares <th>etiqueta</th><td>valor</td> de un fragmento, por etiqueta. */
export function camposDeTabla(html: string): Record<string, string> {
  const campos: Record<string, string> = {};
  const re = /<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const etiqueta = textoPlano(m[1] ?? "");
    if (etiqueta && !(etiqueta in campos)) campos[etiqueta] = textoPlano(m[2] ?? "");
  }
  return campos;
}

/** "171.670,00 €" -> 171670. "Sin puja mínima", "No consta", "Ver ..." -> null.
 *  Un cero tambien es null: el portal pone "0,00 €" cuando no hay dato. */
export function importe(texto: string | undefined): number | null {
  if (!texto) return null;
  const m = /(\d[\d.,]*)\s*€/.exec(texto);
  if (!m) return null;
  const v = importeEnCifras(m[1] ?? "");
  return v != null && v > 0 ? v : null;
}

/** El portal escribe cada fecha dos veces y la segunda viene en ISO. */
export function fechaIso(texto: string | undefined): string | null {
  if (!texto) return null;
  const m = /ISO:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}(?:[+-][0-9]{2}:[0-9]{2}|Z)?)/.exec(texto);
  return m?.[1] ?? null;
}

export function tipoDeSubasta(texto: string | undefined, idExterno: string): TipoSubasta {
  const t = (texto ?? "").toUpperCase();
  if (t.includes("CONCURSAL")) return "concursal";
  if (t.includes("NOTARIAL")) return "notarial";
  if (t.includes("AGENCIA TRIBUTARIA")) return "aeat";
  if (t.includes("SEGURIDAD SOCIAL")) return "seguridad_social";
  if (t.includes("JUDICIAL")) return "judicial";
  // "RECAUDACIÓN TRIBUTARIA" son haciendas locales y autonomicas: para el
  // comprador funciona como una subasta administrativa, no judicial.
  if (t.includes("RECAUDACI")) return "otra";
  const prefijo = /^SUB-([A-Z]+)-/.exec(idExterno)?.[1] ?? "";
  if (prefijo.startsWith("J")) return "judicial";
  if (prefijo === "AT") return "aeat";
  if (prefijo.startsWith("N")) return "notarial";
  return "otra";
}

/** "Bien 1 - Inmueble (Vivienda)" -> vivienda. null si no es un inmueble. */
export function tipoDeBien(cabecera: string): TipoBien | null {
  const c = cabecera.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!c.includes("inmueble")) return null;
  const sub = /\(([^)]*)\)/.exec(c)?.[1] ?? "";
  if (/vivienda|piso|casa|apartamento|chalet|duplex|atico/.test(sub)) return "vivienda";
  if (/garaje|aparcamiento|plaza/.test(sub)) return "garaje";
  if (/trastero/.test(sub)) return "trastero";
  if (/local/.test(sub)) return "local";
  if (/nave/.test(sub)) return "nave";
  if (/oficina|despacho/.test(sub)) return "oficina";
  if (/rustic/.test(sub)) return "rustica";
  if (/solar|suelo|terreno|parcela|finca urbana/.test(sub)) return "suelo";
  if (/edificio/.test(sub)) return "edificio";
  return "otro";
}

const ESTADO_POR_ETIQUETA: Array<[RegExp, Estado]> = [
  [/pr[oó]xima apertura/i, "publicada"],
  [/celebr[aá]ndose/i, "celebrandose"],
  [/suspendida/i, "suspendida"],
  [/cancelada/i, "cancelada"],
  [/concluida/i, "puja_concluida"],
  [/finalizada/i, "finalizada"],
];

export function estadoDeEtiqueta(texto: string): Estado {
  for (const [re, estado] of ESTADO_POR_ETIQUETA) if (re.test(texto)) return estado;
  return "desconocido";
}

/** Las frases de la cabecera de la ficha, cuando el portal dice algo. */
export function estadoDeCabecera(cabecera: string): Estado | null {
  const c = cabecera.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/ha concluido su periodo de pujas/.test(c)) return "puja_concluida";
  if (/temporalmente suspendida/.test(c)) return "suspendida";
  if (/subasta (ha sido |esta |se encuentra )?cancelada/.test(c)) return "cancelada";
  if (/subasta (ha sido |esta |se encuentra )?finalizada|ha finalizado/.test(c)) return "finalizada";
  return null;
}

/** Cuota del titulo juridico: "50% PLENO DOMINIO" -> 0.5. Sin dato, pleno. */
export function cuotaDeTitulo(texto: string | undefined): number {
  if (!texto) return 1;
  const t = texto.toLowerCase();
  const pct = /(\d{1,3}(?:[.,]\d+)?)\s*%/.exec(t);
  if (pct) {
    const v = Number.parseFloat((pct[1] ?? "").replace(",", ".")) / 100;
    if (v > 0 && v < 1) return Math.round(v * 10_000) / 10_000;
    return 1;
  }
  if (/mitad indivisa|una mitad|1\/2/.test(t)) return 0.5;
  if (/tercera parte|1\/3/.test(t)) return 0.3333;
  if (/cuarta parte|1\/4/.test(t)) return 0.25;
  return 1;
}

function situacionDeCampo(texto: string | undefined): Situacion | undefined {
  if (!texto) return undefined;
  const t = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // "No consta (…)" se deja al extractor, que leera el parentesis con su cita.
  if (/^no consta/.test(t)) return undefined;
  if (/ocupad|arrendad|alquilad|inquilin|arrendatari/.test(t)) return "ocupado";
  if (/libre|desocupad|sin ocupantes|vacio|vacia/.test(t)) return "libre";
  return undefined;
}

function booleanoDeCampo(texto: string | undefined): boolean | null {
  if (!texto) return null;
  const t = texto.trim().toLowerCase();
  if (/^s[ií]\b/.test(t)) return true;
  if (/^no\b(?! consta)/.test(t)) return false;
  return null;
}

// --- Listado de busqueda -------------------------------------------------

export interface ResultadoBusqueda {
  idExterno: string;
  estado: Estado;
  /** Numero de procedimiento ("0383/19"). Solo lo trae el listado, no la ficha. */
  expediente: string | null;
}

export interface PaginaBusqueda {
  resultados: ResultadoBusqueda[];
  /** URL absoluta de la pagina siguiente, o null si es la ultima. */
  siguiente: string | null;
}

export function parsearBusqueda(html: string, base = BASE_PORTAL): PaginaBusqueda {
  const resultados: ResultadoBusqueda[] = [];
  // El titulo puede llevar coletilla: "SUBASTA SUB-JA-2024-230270 (10 lotes)".
  const re = /<h3>\s*SUBASTA\s+(SUB-[A-Z0-9-]+)[^<]*<\/h3>([\s\S]*?)(?=<h3>\s*SUBASTA|<div class="paginar)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const idExterno = m[1] ?? "";
    const cuerpo = m[2] ?? "";
    const etiqueta = /Estado:\s*([^<[]*)/.exec(cuerpo)?.[1] ?? "";
    const expediente = /Expediente:\s*([^<]*)/.exec(cuerpo)?.[1]?.trim() || null;
    resultados.push({ idExterno, estado: estadoDeEtiqueta(etiqueta), expediente });
  }

  const sig = /<a\s+href="([^"]*accion=Mas[^"]*)"[^>]*>(?:\s*<abbr[^>]*>[^<]*<\/abbr>)?\s*siguiente\s*<\/a>/i.exec(html);
  const siguiente = sig?.[1] ? new URL(decodificarEntidades(sig[1]), `${base}/`).toString() : null;
  return { resultados, siguiente };
}

// --- Ficha ---------------------------------------------------------------

export interface PaginasFicha {
  general: string;
  autoridad: string;
  /** Pestaña de bienes de cada lote, en orden. Un solo lote: una pagina. */
  lotes: string[];
  pujas: string;
}

/** True si el portal dice que la subasta ya no existe. */
export function noExiste(html: string): boolean {
  return /ERROR:\s*La subasta\s+SUB-[A-Z0-9-]+\s+no existe/i.test(textoPlano(html));
}

/** Numero de lotes segun la pestaña general: "Sin lotes" -> 1, "10" -> 10. */
export function numeroDeLotes(general: string): number {
  const n = camposDeTabla(general)["Lotes"];
  const v = Number.parseInt(n ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

function cabeceraDeFicha(html: string): string {
  const ini = html.indexOf('<div id="contenido"');
  const fin = html.indexOf('<div id="tabs"', ini);
  return textoPlano(fin > ini ? html.slice(ini, fin) : html.slice(ini, ini + 4000));
}

function bloqueDeLote(html: string, numero: number): string {
  const marca = `id="idBloqueLote${numero}"`;
  let ini = html.indexOf(marca);
  if (ini < 0) ini = html.indexOf('class="bloque"');
  if (ini < 0) return "";
  let fin = html.indexOf('<div class="bloque"', ini + marca.length);
  if (fin < 0) fin = html.indexOf('<div class="bloqueBotones"', ini);
  return fin > ini ? html.slice(ini, fin) : html.slice(ini);
}

interface PujasLeidas {
  /** Por numero de lote; la clave 0 es la subasta entera. */
  porLote: Map<number, number | null>;
}

function pujasDeCampo(texto: string): number | null {
  const t = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/no ha recibido pujas|sin pujas/.test(t)) return 0;
  if (/ha recibido alguna puja|con puja/.test(t)) return 1;
  return null;
}

export function parsearPujas(html: string): PujasLeidas {
  const porLote = new Map<number, number | null>();
  const ini = html.indexOf('id="idBloqueDatos8"');
  const bloque = ini >= 0 ? html.slice(ini, html.indexOf("bloqueBotones", ini)) : html;

  const filas = /<tbody>([\s\S]*?)<\/tbody>/.exec(bloque)?.[1];
  if (filas) {
    const re = /<tr>\s*<td[^>]*>\s*(\d+)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(filas)) !== null) {
      porLote.set(Number.parseInt(m[1] ?? "", 10), pujasDeCampo(textoPlano(m[2] ?? "")));
    }
  } else {
    porLote.set(0, pujasDeCampo(textoPlano(bloque)));
  }
  return { porLote };
}

function bienesDeBloque(bloque: string): BienBruto[] {
  const bienes: BienBruto[] = [];
  const trozos = bloque.split(/<h4>(?=\s*Bien\s)/).slice(1);
  for (const trozo of trozos) {
    const cabecera = textoPlano(trozo.slice(0, trozo.indexOf("</h4>")));
    const tipo = tipoDeBien(cabecera);
    // Vehiculos y otros muebles no son cosa de este buscador.
    if (!tipo) continue;
    const c = camposDeTabla(trozo);
    const provincia = c["Provincia"] || null;
    bienes.push({
      tipo,
      descripcion: c["Descripción"] || null,
      direccion: c["Dirección"] || null,
      codigoPostal: c["Código Postal"] || null,
      municipio: c["Localidad"] || null,
      provincia,
      comunidad: comunidadDeProvincia(provincia),
      referenciaCatastral: c["Referencia catastral"]?.replace(/\s+/g, "") || null,
      cuotaPropiedad: cuotaDeTitulo(c["Título jurídico"]),
      inscripcionRegistral: c["Inscripción registral"] || null,
    });
  }
  return bienes;
}

/** Lo que el portal publica en prosa sobre cargas y posesion, con su
 *  etiqueta, para que el extractor lo lea y la ficha lo cite literalmente. */
function textoDeCargas(bloque: string): string | null {
  const lineas: string[] = [];
  const trozos = bloque.split(/<h4>(?=\s*Bien\s)/).slice(1);
  for (const trozo of trozos) {
    const c = camposDeTabla(trozo);
    for (const etiqueta of ["Cargas", "Situación posesoria", "Vivienda habitual", "Título jurídico"]) {
      const v = c[etiqueta];
      if (v) lineas.push(`${etiqueta}: ${v}`);
    }
  }
  return lineas.length ? lineas.join("\n") : null;
}

function loteDeBloque(
  numero: number, bloque: string, importes: Record<string, string>, pujas: PujasLeidas,
  estado: Estado,
): LoteBruto {
  const bienes = bienesDeBloque(bloque);
  // Los campos estructurados del primer bien mandan sobre la extraccion.
  const primero = camposDeTabla(bloque.split(/<h4>(?=\s*Bien\s)/)[1] ?? "");
  const cargas = primero["Cargas"];
  // La Agencia Tributaria publica las cargas como importe: "0,00 €" es que no
  // hay, y una cifra es lo que subsiste. Un juzgado escribe prosa, y de esa
  // prosa se ocupa el extractor con su cita.
  const cargasComoImporte = cargas && /^\s*\d[\d.,]*\s*€\s*$/.test(cargas)
    ? (importeEnCifras(cargas.replace(/[€\s]/g, "")) ?? 0)
    : null;

  return {
    numero,
    valorSubasta: importe(importes["Valor subasta"] ?? importes["Valor Subasta"]),
    valorTasacion: importe(importes["Tasación"] ?? importes["Valor de tasación"]),
    pujaMinima: importe(importes["Puja mínima"]),
    deposito: importe(importes["Importe del depósito"]),
    tramos: importe(importes["Tramos entre pujas"]),
    cantidadReclamada: importe(importes["Cantidad reclamada"]),
    estado,
    cargasTexto: textoDeCargas(bloque),
    ...(cargasComoImporte != null
      ? { cargasImporte: cargasComoImporte, cargasSubsisten: cargasComoImporte > 0 }
      : {}),
    situacion: situacionDeCampo(primero["Situación posesoria"]),
    viviendaHabitual: booleanoDeCampo(primero["Vivienda habitual"]),
    numPujas: pujas.porLote.get(numero) ?? pujas.porLote.get(0) ?? null,
    pujaActual: null,
    bienes,
  };
}

/**
 * El estado de una subasta: lo que diga la cabecera de la ficha; si no dice
 * nada, lo que dijo el listado; y si tampoco, lo que se deduce de las fechas
 * (ver la nota 2 de la cabecera del fichero).
 */
function estadoDeFicha(
  general: string,
  fechaInicio: string | null,
  fechaFin: string | null,
  delListado: Pick<ResultadoBusqueda, "estado"> | null,
  ahora: Date,
): Estado {
  const dicho = estadoDeCabecera(cabeceraDeFicha(general)) ?? delListado?.estado ?? null;
  if (dicho) return dicho;
  if (!fechaInicio) return "publicada";
  if (fechaFin && new Date(fechaFin).getTime() > ahora.getTime()) return "celebrandose";
  if (fechaFin) return "puja_concluida";
  return "desconocido";
}

/** Las dos pestañas que bastan para refrescar una subasta ya bajada. */
export interface PaginasRefresco {
  general: string;
  pujas: string;
}

/**
 * Lo que cambia de una subasta ya bajada, a partir de la pestaña general y la
 * de pujas. Funcion pura, hermana de `parsearSubasta`: el estado y las fechas
 * salen de las mismas reglas, y las pujas de la misma pestaña. Lo que no
 * esta aqui (bienes, cargas, importes, autoridad) no cambia tras publicarse.
 */
export function parsearRefresco(
  idExterno: string,
  paginas: PaginasRefresco,
  delListado: Pick<ResultadoBusqueda, "estado"> | null = null,
  ahora: Date = new Date(),
): SubastaRefrescada {
  const general = camposDeTabla(paginas.general);
  const fechaInicio = fechaIso(general["Fecha de inicio"]);
  const fechaFin = fechaIso(general["Fecha de conclusión"]);
  const estado = estadoDeFicha(paginas.general, fechaInicio, fechaFin, delListado, ahora);
  const pujas = parsearPujas(paginas.pujas);
  const n = numeroDeLotes(paginas.general);
  const lotes = Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    estado,
    numPujas: pujas.porLote.get(i + 1) ?? pujas.porLote.get(0) ?? null,
    pujaActual: null,
  }));
  return { idExterno, estado, fechaInicio, fechaFin, lotes };
}

/**
 * Convierte las pestañas de una ficha en una SubastaBruta. Funcion pura: las
 * pruebas la ejercen con paginas guardadas del portal.
 */
export function parsearSubasta(
  idExterno: string,
  paginas: PaginasFicha,
  delListado: Pick<ResultadoBusqueda, "estado" | "expediente"> | null = null,
  ahora: Date = new Date(),
  base = BASE_PORTAL,
): SubastaBruta {
  const general = camposDeTabla(paginas.general);
  const autoridad = camposDeTabla(paginas.autoridad);
  const fechaInicio = fechaIso(general["Fecha de inicio"]);
  const fechaFin = fechaIso(general["Fecha de conclusión"]);

  const estado = estadoDeFicha(paginas.general, fechaInicio, fechaFin, delListado, ahora);

  const pujas = parsearPujas(paginas.pujas);
  const varios = paginas.lotes.length > 1;
  const lotes: LoteBruto[] = paginas.lotes.map((html, i) => {
    const numero = i + 1;
    const bloque = bloqueDeLote(html, numero);
    // Con varios lotes los importes van en la tabla de cada lote; con uno,
    // en la general.
    const importes = varios ? camposDeTabla(bloque) : general;
    return loteDeBloque(numero, bloque, importes, pujas, estado);
  });

  const tipoTexto = general["Tipo de subasta"];
  return {
    idExterno,
    tipo: tipoDeSubasta(tipoTexto, idExterno),
    estado,
    procedimiento: tipoTexto ? capitalizar(tipoTexto) : null,
    // La ficha solo trae la cuenta de consignaciones, que no es el expediente;
    // el numero de procedimiento esta en el listado y se guarda al descubrir.
    expediente: delListado?.expediente ?? null,
    autoridad: autoridad["Descripción"] || null,
    fechaPublicacion: null,
    fechaInicio,
    fechaFin,
    url: `${base}/detalleSubasta.php?idSub=${encodeURIComponent(idExterno)}`,
    lotes,
  };
}

function capitalizar(texto: string): string {
  const t = texto.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// --- El adaptador --------------------------------------------------------

const UA_POR_DEFECTO = "subastapp/0.1 (buscador privado; rastreo lento y sin sesion)";

async function obtenerConFetch(url: string): Promise<Obtenido> {
  const contacto = process.env.BOE_CONTACTO;
  const control = new AbortController();
  const tope = setTimeout(() => control.abort(), 30_000);
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": contacto ? `${UA_POR_DEFECTO} ${contacto}` : UA_POR_DEFECTO,
        "Accept-Language": "es",
      },
      signal: control.signal,
      redirect: "follow",
    });
    return { estado: r.status, cuerpo: await r.text() };
  } finally {
    clearTimeout(tope);
  }
}

export class AdaptadorBOE implements Adaptador {
  readonly nombre = "boe";
  readonly msEntrePeticiones: number;

  private readonly obtener: Obtener;
  private readonly estados: EstadoPortal[];
  private readonly base: string;
  private readonly limitador;
  /** Estado y expediente que dijo el listado, por id. La ficha no los trae. */
  private readonly vistos = new Map<string, Pick<ResultadoBusqueda, "estado" | "expediente">>();

  constructor(opciones: OpcionesBOE = {}) {
    this.obtener = opciones.obtener ?? obtenerConFetch;
    this.estados = opciones.estados ?? ["PU", "EJ", "SU"];
    this.msEntrePeticiones = opciones.msEntrePeticiones ?? 1_500;
    this.base = opciones.base ?? BASE_PORTAL;
    this.limitador = crearLimitador(this.msEntrePeticiones);
  }

  /** Peticiones hechas desde que se creo. */
  peticiones(): number {
    return this.limitador.hechas();
  }

  private async pedir(url: string): Promise<string> {
    await this.limitador.turno();
    const r = await this.obtener(url);
    if (r.estado !== 200) throw new ErrorPortal(r.estado, url);
    return r.cuerpo;
  }

  urlBusqueda(estado: EstadoPortal): string {
    const p = new URLSearchParams();
    p.set("campo[2]", "SUBASTA.ESTADO.CODIGO");
    p.set("dato[2]", estado);
    p.set("campo[3]", "BIEN.TIPO");
    p.set("dato[3]", "I");
    p.set("page_hits", "500");
    p.set("sort_field[0]", "SUBASTA.FECHA_FIN");
    p.set("sort_order[0]", "asc");
    p.set("accion", "Buscar");
    return `${this.base}/subastas_ava.php?${p.toString()}`;
  }

  urlFicha(idExterno: string, ver: number, idLote?: number): string {
    const p = new URLSearchParams({ idSub: idExterno, ver: String(ver) });
    if (idLote != null) p.set("idLote", String(idLote));
    return `${this.base}/detalleSubasta.php?${p.toString()}`;
  }

  /**
   * Recorre los tres estados publicos del buscador, pagina a pagina. El
   * portal no sabe decir "que ha cambiado desde", asi que `desde` no se usa:
   * el planificador de refresco es quien decide cuando volver a mirar cada una.
   */
  async *descubrir(_desde: Date): AsyncIterable<string> {
    const emitidos = new Set<string>();
    for (const estado of this.estados) {
      let url: string | null = this.urlBusqueda(estado);
      while (url) {
        const pagina = parsearBusqueda(await this.pedir(url), this.base);
        for (const r of pagina.resultados) {
          this.vistos.set(r.idExterno, { estado: r.estado, expediente: r.expediente });
          if (!emitidos.has(r.idExterno)) {
            emitidos.add(r.idExterno);
            yield r.idExterno;
          }
        }
        url = pagina.siguiente;
      }
    }
  }

  async detalle(idExterno: string): Promise<ResultadoDetalle | null> {
    const general = await this.pedir(this.urlFicha(idExterno, 1));
    if (noExiste(general)) return null;

    const autoridad = await this.pedir(this.urlFicha(idExterno, 2));
    const n = numeroDeLotes(general);
    const lotes: string[] = [await this.pedir(this.urlFicha(idExterno, 3))];
    for (let i = 2; i <= n; i++) lotes.push(await this.pedir(this.urlFicha(idExterno, 3, i)));
    const pujas = await this.pedir(this.urlFicha(idExterno, 5));

    const paginas: PaginasFicha = { general, autoridad, lotes, pujas };
    const subasta = parsearSubasta(idExterno, paginas, this.vistos.get(idExterno) ?? null, new Date(), this.base);

    const crudo: Crudo[] = [
      { etiqueta: "general", contenido: general },
      { etiqueta: "autoridad", contenido: autoridad },
      ...lotes.map((html, i) => ({ etiqueta: `bienes-lote-${i + 1}`, contenido: html })),
      { etiqueta: "pujas", contenido: pujas },
    ];
    return { subasta, crudo };
  }

  /**
   * Refresco en dos peticiones: la pestaña general (estado y fechas) y la de
   * pujas. La autoridad gestora y los bienes no cambian tras publicarse, asi
   * que no se vuelven a pedir: a segundo y medio por peticion, es la mitad
   * del tiempo de portal de cada refresco. El crudo de las dos pestañas se
   * guarda igual que en el detalle completo.
   */
  async detalleLigero(idExterno: string): Promise<ResultadoRefresco | null> {
    const general = await this.pedir(this.urlFicha(idExterno, 1));
    if (noExiste(general)) return null;
    const pujas = await this.pedir(this.urlFicha(idExterno, 5));

    const subasta = parsearRefresco(idExterno, { general, pujas }, this.vistos.get(idExterno) ?? null);
    const crudo: Crudo[] = [
      { etiqueta: "general", contenido: general },
      { etiqueta: "pujas", contenido: pujas },
    ];
    return { subasta, crudo };
  }
}
