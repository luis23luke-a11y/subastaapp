// ---------------------------------------------------------------------------
// Cliente de los servicios web del Catastro (datos no protegidos, gratuitos).
//
// Tres cosas que costaron encontrar y conviene no volver a descubrir:
//
//   1. Los enlaces HttpGet que anuncia el WSDL estan desactivados en el
//      servidor: devuelven un 400 con una pagina de error en HTML. Solo
//      funciona SOAP por POST.
//   2. El cuerpo SOAP va "bare": los parametros son elementos sueltos dentro
//      del Body, sin envolverlos en un elemento con el nombre de la operacion.
//   3. Los parametros viven en el espacio de nombres http://www.catastro.meh.es/,
//      mientras que el SOAPAction usa http://tempuri.org/... Mezclarlos
//      devuelve "EL CAMPO SRS ES OBLIGATORIO" aunque el campo este ahi.
//
// Es un servicio publico y gratuito, asi que todo pasa por cache y por un
// limitador de ritmo.
// ---------------------------------------------------------------------------

import { XMLParser } from "fast-xml-parser";
import { consultar, unaFila } from "@/lib/db";
import { crearLimitador } from "@/ingesta/limitador";

const BASE = "https://ovc.catastro.meh.es/ovcservweb/ovcswlocalizacionrc";
const NS_PARAMS = "http://www.catastro.meh.es/";
const NS_ACCION = "http://tempuri.org/OVCServWeb";

const SERVICIOS = {
  coordenadas: { url: `${BASE}/ovccoordenadas.asmx`, accion: `${NS_ACCION}/OVCCoordenadas` },
  callejero: { url: `${BASE}/ovccallejero.asmx`, accion: `${NS_ACCION}/OVCCallejero` },
} as const;

// Un servicio publico merece un ritmo prudente aunque no lo exija.
const limitador = crearLimitador(350);

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  removeNSPrefix: true,
});

export class ErrorCatastro extends Error {
  constructor(readonly codigo: string, mensaje: string) {
    super(`Catastro ${codigo}: ${mensaje}`);
    this.name = "ErrorCatastro";
  }
}

function escapar(v: string): string {
  return v.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

function sobre(parametros: Array<[string, string]>): string {
  const cuerpo = parametros
    .map(([k, v]) => `<${k} xmlns="${NS_PARAMS}">${escapar(v)}</${k}>`)
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body>${cuerpo}</soap:Body></soap:Envelope>`;
}

/** Busca el primer valor de una clave en un arbol ya parseado. */
function buscar(nodo: unknown, clave: string): unknown {
  if (nodo == null || typeof nodo !== "object") return undefined;
  if (Array.isArray(nodo)) {
    for (const h of nodo) {
      const r = buscar(h, clave);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  const obj = nodo as Record<string, unknown>;
  if (clave in obj) return obj[clave];
  for (const v of Object.values(obj)) {
    const r = buscar(v, clave);
    if (r !== undefined) return r;
  }
  return undefined;
}

const comoLista = <T,>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

const texto = (v: unknown): string | null =>
  v == null || typeof v === "object" ? null : String(v).trim() || null;

const numero = (v: unknown): number | null => {
  const t = texto(v);
  if (t == null) return null;
  const n = Number.parseFloat(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

async function llamar(
  servicio: keyof typeof SERVICIOS,
  operacion: string,
  parametros: Array<[string, string]>,
  clave: string,
): Promise<Record<string, unknown>> {
  const cacheado = await unaFila<{ parseado: Record<string, unknown> | null; error_cod: string | null; error_desc: string | null }>(
    `select parseado, error_cod, error_desc from catastro_cache
     where operacion = $1 and clave = $2 and obtenido > now() - interval '180 days'`,
    [operacion, clave],
  );
  if (cacheado) {
    if (cacheado.error_cod) throw new ErrorCatastro(cacheado.error_cod, cacheado.error_desc ?? "");
    return cacheado.parseado ?? {};
  }

  await limitador.turno();
  const { url, accion } = SERVICIOS[servicio];
  const respuesta = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "text/xml; charset=utf-8",
      soapaction: `"${accion}/${operacion}"`,
      "user-agent": "SubastApp/0.1 (buscador de subastas; contacto en la web)",
    },
    body: sobre(parametros),
    signal: AbortSignal.timeout(20_000),
  });

  const crudo = await respuesta.text();
  if (!respuesta.ok) {
    throw new Error(`Catastro respondio ${respuesta.status} en ${operacion}`);
  }

  const arbol = parser.parse(crudo) as Record<string, unknown>;

  // El servicio devuelve 200 aunque haya error: va dentro del cuerpo.
  const err = comoLista(buscar(arbol, "err") as Record<string, unknown> | Record<string, unknown>[] | undefined)[0];
  const codigo = err ? texto(err["cod"]) : null;
  const descripcion = err ? texto(err["des"]) : null;

  await consultar(
    `insert into catastro_cache (operacion, clave, crudo, parseado, error_cod, error_desc)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (operacion, clave) do update set
       obtenido = now(), crudo = excluded.crudo, parseado = excluded.parseado,
       error_cod = excluded.error_cod, error_desc = excluded.error_desc`,
    [operacion, clave, crudo, codigo ? null : JSON.stringify(arbol), codigo, descripcion],
  );

  if (codigo) throw new ErrorCatastro(codigo, descripcion ?? "");
  return arbol;
}

// --- Operaciones -----------------------------------------------------------

export interface Coordenadas {
  lat: number;
  lon: number;
  referenciaCatastral: string | null;
  direccionLarga: string | null;
}

/** Referencia catastral -> coordenadas del centroide de la parcela. */
export async function coordenadasDeReferencia(refCat: string): Promise<Coordenadas | null> {
  const rc14 = refCat.replace(/\s+/g, "").toUpperCase().slice(0, 14);
  if (rc14.length < 14) return null;

  const arbol = await llamar("coordenadas", "Consulta_CPMRC",
    [["Provincia", ""], ["Municipio", ""], ["SRS", "EPSG:4326"], ["RefCat", rc14]], rc14);

  const geo = buscar(arbol, "geo") as Record<string, unknown> | undefined;
  const lon = numero(geo?.["xcen"]);
  const lat = numero(geo?.["ycen"]);
  if (lat == null || lon == null) return null;

  const pc = buscar(arbol, "pc") as Record<string, unknown> | undefined;
  const rc = pc ? `${texto(pc["pc1"]) ?? ""}${texto(pc["pc2"]) ?? ""}` : null;

  return { lat, lon, referenciaCatastral: rc || rc14, direccionLarga: texto(buscar(arbol, "ldt")) };
}

/** Coordenadas -> referencia catastral (geocodificacion inversa). */
export async function referenciaDeCoordenadas(lat: number, lon: number): Promise<Coordenadas | null> {
  const clave = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  const arbol = await llamar("coordenadas", "Consulta_RCCOOR",
    [["SRS", "EPSG:4326"], ["CoorX", String(lon)], ["CoorY", String(lat)]], clave);

  const pc = buscar(arbol, "pc") as Record<string, unknown> | undefined;
  if (!pc) return null;
  return {
    lat, lon,
    referenciaCatastral: `${texto(pc["pc1"]) ?? ""}${texto(pc["pc2"]) ?? ""}` || null,
    direccionLarga: texto(buscar(arbol, "ldt")),
  };
}

export interface DatosCatastrales {
  referenciaCatastral: string;
  uso: string | null;
  superficie: number | null;
  anio: number | null;
  coeficienteParticipacion: number | null;
  provincia: string | null;
  municipio: string | null;
  codigoPostal: string | null;
  direccionLarga: string | null;
  /** Cuando la referencia es de parcela, las unidades que contiene. */
  unidades: string[];
}

/** Datos no protegidos de un bien. Con referencia de 20 caracteres devuelve
 *  superficie, uso y antiguedad; con una de 14 devuelve las unidades de la
 *  parcela, porque una parcela con siete pisos no tiene una sola superficie. */
export async function datosDeReferencia(refCat: string): Promise<DatosCatastrales | null> {
  const rc = refCat.replace(/\s+/g, "").toUpperCase();
  if (rc.length < 14) return null;

  const arbol = await llamar("callejero", "Consulta_DNPRC",
    [["Provincia", ""], ["Municipio", ""], ["RefCat", rc]], rc);

  const base: DatosCatastrales = {
    referenciaCatastral: rc,
    uso: null, superficie: null, anio: null, coeficienteParticipacion: null,
    provincia: texto(buscar(arbol, "np")),
    municipio: texto(buscar(arbol, "nm")),
    codigoPostal: texto(buscar(arbol, "dp")),
    direccionLarga: texto(buscar(arbol, "ldt")),
    unidades: [],
  };

  const debi = buscar(arbol, "debi") as Record<string, unknown> | undefined;
  if (debi) {
    base.uso = texto(debi["luso"]);
    base.superficie = numero(debi["sfc"]);
    base.anio = numero(debi["ant"]);
    base.coeficienteParticipacion = numero(debi["cpt"]);
    return base;
  }

  // Referencia de parcela: lista de unidades.
  const lista = comoLista(buscar(arbol, "rcdnp") as Record<string, unknown>[] | Record<string, unknown> | undefined);
  base.unidades = lista
    .map((u) => {
      const r = u["rc"] as Record<string, unknown> | undefined;
      if (!r) return null;
      return ["pc1", "pc2", "car", "cc1", "cc2"].map((k) => texto(r[k]) ?? "").join("");
    })
    .filter((v): v is string => Boolean(v));

  return base;
}

/** Direccion -> referencias catastrales de ese portal. Devuelve todas las
 *  unidades del numero, que pueden ser muchas en un edificio de pisos. */
export async function referenciasDeDireccion(opciones: {
  provincia: string;
  municipio: string;
  sigla: string;
  calle: string;
  numero: string;
}): Promise<string[]> {
  const clave = [opciones.provincia, opciones.municipio, opciones.sigla, opciones.calle, opciones.numero]
    .map((v) => v.toUpperCase()).join("|");

  const arbol = await llamar("callejero", "Consulta_DNPLOC", [
    ["Provincia", opciones.provincia], ["Municipio", opciones.municipio],
    ["Sigla", opciones.sigla], ["Calle", opciones.calle], ["Numero", opciones.numero],
    ["Bloque", ""], ["Escalera", ""], ["Planta", ""], ["Puerta", ""],
  ], clave);

  const lista = comoLista(
    buscar(arbol, "rcdnp") as Record<string, unknown>[] | Record<string, unknown> | undefined,
  );
  return lista
    .map((u) => {
      const r = u["rc"] as Record<string, unknown> | undefined;
      if (!r) return null;
      return ["pc1", "pc2", "car", "cc1", "cc2"].map((k) => texto(r[k]) ?? "").join("");
    })
    .filter((v): v is string => v != null && v.length >= 14);
}
