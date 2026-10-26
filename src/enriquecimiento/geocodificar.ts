// ---------------------------------------------------------------------------
// Cadena de geocodificacion.
//
// Tres intentos, de mas a menos preciso, y la clave de todo: se declara
// SIEMPRE de donde salieron las coordenadas. Un punto en el centro del pueblo
// pintado como si fuera el portal exacto es peor que no pintar nada, porque el
// usuario toma decisiones con el mapa.
// ---------------------------------------------------------------------------

import {
  coordenadasDeReferencia, datosDeReferencia, referenciasDeDireccion, ErrorCatastro,
} from "@/enriquecimiento/catastro";
import { limpiarReferenciaCatastral, partirDireccion } from "@/enriquecimiento/direccion";
import { MUNICIPIOS } from "@/datos/municipios";
import type { PrecisionGeo } from "@/lib/tipos";

const PORNOMBRE = new Map(
  MUNICIPIOS.map((m) => [m.nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(), m]),
);

export interface ResultadoGeo {
  lat: number | null;
  lon: number | null;
  precision: PrecisionGeo;
  referenciaCatastral: string | null;
  m2Construidos: number | null;
  anioConstruccion: number | null;
  usoCatastral: string | null;
  codigoPostal: string | null;
  comoSeObtuvo: string;
}

const VACIO: ResultadoGeo = {
  lat: null, lon: null, precision: "ninguna", referenciaCatastral: null,
  m2Construidos: null, anioConstruccion: null, usoCatastral: null,
  codigoPostal: null, comoSeObtuvo: "Sin datos suficientes para localizarlo",
};

/** Los errores del Catastro por dato ausente no son fallos del worker: se
 *  pasa al siguiente intento de la cadena. */
function esDatoAusente(err: unknown): boolean {
  return err instanceof ErrorCatastro;
}

export async function geocodificar(bien: {
  referenciaCatastral: string | null;
  direccion: string | null;
  municipio: string | null;
  provincia: string | null;
}): Promise<ResultadoGeo> {
  // 1. Por referencia catastral: lo exacto. Limpia de puntos, barras y
  //    textos que no son una referencia (ver `limpiarReferenciaCatastral`).
  const referencia = limpiarReferenciaCatastral(bien.referenciaCatastral);
  if (referencia) {
    try {
      const resultado = await porReferencia(referencia);
      if (resultado) return resultado;
    } catch (err) {
      if (!esDatoAusente(err)) throw err;
    }
  }

  // 2. Por direccion: se le pregunta al Catastro que hay en ese portal.
  const partida = partirDireccion(bien.direccion);
  if (partida?.numero && bien.municipio && bien.provincia) {
    try {
      const referencias = await referenciasDeDireccion({
        provincia: bien.provincia, municipio: bien.municipio,
        sigla: partida.sigla, calle: partida.nombre, numero: partida.numero,
      });
      // Varias unidades en el mismo portal comparten parcela y coordenadas:
      // basta la primera para situarlo.
      const primera = referencias[0];
      if (primera) {
        const resultado = await porReferencia(primera);
        if (resultado) {
          return { ...resultado, precision: "portal",
            comoSeObtuvo: `Portal localizado en el Catastro: ${partida.sigla} ${partida.nombre} ${partida.numero}` };
        }
      }
    } catch (err) {
      if (!esDatoAusente(err)) throw err;
    }
  }

  // 3. Centroide del municipio: sirve para el mapa, no para ir a verlo.
  const muni = bien.municipio
    ? PORNOMBRE.get(bien.municipio.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase())
    : undefined;
  if (muni) {
    return {
      ...VACIO, lat: muni.lat, lon: muni.lon, precision: "municipio",
      comoSeObtuvo: `Centro de ${muni.nombre}: la dirección no permite más precisión`,
    };
  }

  return VACIO;
}

async function porReferencia(refCat: string): Promise<ResultadoGeo | null> {
  const coords = await coordenadasDeReferencia(refCat);
  if (!coords) return null;

  let datos = null;
  try {
    datos = await datosDeReferencia(refCat);

    // Una referencia de parcela (14 caracteres) no tiene superficie propia:
    // devuelve la lista de inmuebles que contiene. Si solo hay uno, que es el
    // caso de una casa unifamiliar, ese inmueble ES la parcela y sus datos
    // valen. Con varios no se elige: un edificio de siete pisos no tiene una
    // superficie.
    if (datos && datos.superficie == null && datos.unidades.length === 1) {
      const unica = await datosDeReferencia(datos.unidades[0]!);
      if (unica?.superficie != null) datos = unica;
    }
  } catch (err) {
    // Sin datos descriptivos seguimos teniendo las coordenadas, que es lo
    // que mas vale.
    if (!esDatoAusente(err)) throw err;
  }

  return {
    lat: coords.lat,
    lon: coords.lon,
    precision: "catastral",
    // El servicio de coordenadas trabaja a nivel de parcela y devuelve los 14
    // primeros caracteres. Si entramos con la referencia completa de 20, esa
    // es la buena: identifica el piso, no el edificio entero.
    referenciaCatastral: refCat.length >= 20 ? refCat : (coords.referenciaCatastral ?? refCat),
    m2Construidos: datos?.superficie ?? null,
    anioConstruccion: datos?.anio ?? null,
    usoCatastral: datos?.uso ?? null,
    codigoPostal: datos?.codigoPostal ?? null,
    comoSeObtuvo: `Referencia catastral ${refCat}`,
  };
}
