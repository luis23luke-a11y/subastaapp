// ---------------------------------------------------------------------------
// Centro de un municipio, preguntado a CartoCiudad (Instituto Geografico
// Nacional). Es el geocodificador publico del Estado: sin clave, sin registro,
// datos con licencia CC BY 4.0 del IGN, y cubre tambien Pais Vasco y Navarra,
// que el Catastro estatal no.
//
// Solo se le pide el centro del nucleo de poblacion que lleva el nombre del
// municipio (donde esta el ayuntamiento), y a falta de el, el del termino
// municipal entero. Nunca una direccion: el portal exacto sigue siendo cosa
// del Catastro, que es la fuente oficial de la parcela. Lo que devuelve se
// guarda en municipio_centro (db/007_municipio_centro.sql) y no se vuelve a
// preguntar, porque un pueblo no se mueve. Hasta el 27 de octubre de 2026 el
// centro salia de la tabla de 51 ciudades de src/datos/municipios.ts, y de
// los 1.003 bienes reales sin localizar ninguno estaba en ella.
// ---------------------------------------------------------------------------

import { consultar, unaFila } from "@/lib/db";
import { crearLimitador } from "@/ingesta/limitador";
import {
  elegirPoblacion, nombreOficialDe, normalizarNombre, type CandidatoCartoCiudad,
} from "@/enriquecimiento/coincidir";

const BASE = "https://www.cartociudad.es/geocoder/api/geocoder";
const AGENTE = "SubastApp/0.1 (buscador de subastas; contacto en la web)";

// Un servicio publico merece un ritmo prudente aunque no lo exija.
const limitador = crearLimitador(500);

export interface CentroMunicipio {
  lat: number;
  lon: number;
  /** "poblacion" si es el nucleo urbano; "municipio" si es el termino entero. */
  alcance: "poblacion" | "municipio";
  /** El nombre oficial con el que CartoCiudad lo conoce. */
  nombre: string;
}

async function pedir(ruta: string): Promise<unknown> {
  await limitador.turno();
  let respuesta: Response;
  try {
    // Sin cabecera Accept: candidates responde 406 si se le pide JSON
    // aunque JSON es lo que devuelve.
    respuesta = await fetch(`${BASE}/${ruta}`, {
      headers: { "user-agent": AGENTE },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const causa = err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
    const mensaje = err instanceof Error ? err.message : String(err);
    throw new Error(`CartoCiudad no responde: ${mensaje}${causa ? ` (${causa})` : ""}`);
  }
  if (!respuesta.ok) throw new Error(`CartoCiudad respondio ${respuesta.status} en ${ruta.split("?")[0]}`);
  return (await respuesta.json()) as unknown;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Pregunta a CartoCiudad por el centro. Null si no conoce el municipio.
 * `candidates` busca de forma aproximada y devuelve de todo (poblaciones,
 * calles, topónimos); el parametro `type` no filtra. Vale igual: cualquier
 * candidato del municipio trae su codigo INE, y con el `find` da el centro
 * del termino. Un exonimo ("Ibiza") se pregunta tambien por su nombre
 * oficial ("Eivissa"), que es el unico que CartoCiudad conoce.
 */
async function preguntarCentro(municipio: string, provincia: string): Promise<CentroMunicipio | null> {
  const nombres = [municipio];
  const oficial = nombreOficialDe(municipio);
  if (oficial) nombres.push(oficial);
  const lista: CandidatoCartoCiudad[] = [];
  for (const nombre of nombres) {
    const candidatos = await pedir(`candidates?q=${encodeURIComponent(nombre)}&limit=20`);
    for (const c of (Array.isArray(candidatos) ? candidatos : []) as Record<string, unknown>[]) {
      const candidato = {
        id: texto(c["id"]) ?? "",
        type: texto(c["type"]) ?? "",
        muni: texto(c["muni"]) ?? "",
        muniCode: texto(c["muniCode"]),
        province: texto(c["province"]) ?? "",
        poblacion: texto(c["poblacion"]),
      };
      if (candidato.id && candidato.muni) lista.push(candidato);
    }
  }
  const elegido = elegirPoblacion(municipio, provincia, lista);
  if (!elegido) return null;

  const detalle = await pedir(`find?id=${encodeURIComponent(elegido.id)}&type=${encodeURIComponent(elegido.type)}`) as Record<string, unknown>;
  const lat = Number(detalle["lat"]);
  const lon = Number(detalle["lng"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  return {
    lat, lon,
    alcance: elegido.type === "poblacion" ? "poblacion" : "municipio",
    nombre: elegido.nombre,
  };
}

/**
 * Centro del municipio, de la tabla municipio_centro o, la primera vez, de
 * CartoCiudad. Un municipio que CartoCiudad no conoce tambien se apunta, para
 * no preguntar lo mismo en cada pasada; se le vuelve a preguntar a los 180 dias.
 */
export async function centroDeMunicipio(municipio: string, provincia: string): Promise<CentroMunicipio | null> {
  const claveMunicipio = normalizarNombre(municipio);
  const claveProvincia = normalizarNombre(provincia);
  const guardado = await unaFila<{ lat: number | null; lon: number | null; alcance: string | null; nombre: string | null; obtenido: Date }>(
    `select lat, lon, alcance, nombre, obtenido from municipio_centro where provincia = $1 and municipio = $2`,
    [claveProvincia, claveMunicipio],
  );
  if (guardado) {
    if (guardado.lat != null && guardado.lon != null && guardado.nombre) {
      return { lat: guardado.lat, lon: guardado.lon, nombre: guardado.nombre,
        alcance: guardado.alcance === "municipio" ? "municipio" : "poblacion" };
    }
    if (Date.now() - new Date(guardado.obtenido).getTime() < 180 * 24 * 3600 * 1000) return null;
  }

  const centro = await preguntarCentro(municipio, provincia);
  await consultar(
    `insert into municipio_centro (provincia, municipio, lat, lon, alcance, nombre, obtenido)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (provincia, municipio) do update set
       lat = excluded.lat, lon = excluded.lon, alcance = excluded.alcance,
       nombre = excluded.nombre, obtenido = now()`,
    [claveProvincia, claveMunicipio, centro?.lat ?? null, centro?.lon ?? null,
     centro?.alcance ?? null, centro?.nombre ?? null],
  );
  return centro;
}
