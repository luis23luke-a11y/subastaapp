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
import {
  limpiarReferenciaCatastral, lugarCatastral, nombreSinArticulo, partirDireccion,
} from "@/enriquecimiento/direccion";
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

/** Codigo con el que el Catastro responde "LA VÍA NO EXISTE" en Consulta_DNPLOC. */
const VIA_NO_EXISTE = "33";

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
    const resultado = await porDireccion(partida, bien.municipio, bien.provincia);
    if (resultado) return resultado;
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

/**
 * Pregunta al Catastro por un portal. La provincia y el municipio van como
 * los nombra el Catastro ("Málaga" no existe para el; "MALAGA" si), y si
 * responde que la via no existe se prueba una segunda vez sin el articulo
 * inicial: guarda "DEL MAR" en Benalmadena pero "CONSTITUCION", sin "DE
 * LA", en Laguna de Duero, y no hay forma de saberlo sin preguntar. Las
 * dos consultas se quedan en la cache del Catastro.
 */
async function porDireccion(
  partida: { sigla: string; nombre: string; numero: string | null },
  municipio: string,
  provincia: string,
): Promise<ResultadoGeo | null> {
  if (!partida.numero) return null;
  const lugar = lugarCatastral(provincia, municipio);
  const nombres = [partida.nombre];
  const corto = nombreSinArticulo(partida.nombre);
  if (corto) nombres.push(corto);

  for (const nombre of nombres) {
    try {
      const referencias = await referenciasDeDireccion({
        provincia: lugar.provincia, municipio: lugar.municipio,
        sigla: partida.sigla, calle: nombre, numero: partida.numero,
      });
      // Varias unidades en el mismo portal (los pisos de un edificio)
      // comparten parcela y coordenadas: basta la primera para situarlo.
      // Elegir el piso exacto exigiria entender la planta y la puerta del
      // anuncio, que hoy se tiran; la superficie que se guarde es la de esa
      // primera unidad y puede no ser la del bien.
      const primera = referencias[0];
      if (!primera) return null;
      const resultado = await porReferencia(primera);
      if (!resultado) return null;
      return { ...resultado, precision: "portal",
        comoSeObtuvo: `Portal localizado en el Catastro: ${partida.sigla} ${nombre} ${partida.numero}` };
    } catch (err) {
      if (!esDatoAusente(err)) throw err;
      // Solo "la via no existe" justifica el segundo intento sin articulo;
      // "el numero no existe" con el nombre bueno no lo arregla un nombre
      // distinto.
      if (!(err instanceof ErrorCatastro && err.codigo === VIA_NO_EXISTE)) return null;
    }
  }
  return null;
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
