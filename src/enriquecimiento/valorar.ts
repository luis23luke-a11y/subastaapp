// ---------------------------------------------------------------------------
// Valoracion por zona.
//
// AVISO: el indice de precios de src/datos/municipios.ts es de referencia
// general y no es una fuente de valoracion seria. Esta aqui para que la
// cadena funcione de punta a punta; la fuente real son los indices del
// Ministerio de Vivienda, el INE y el Colegio de Registradores por codigo
// postal, y su sustitucion es cambiar solo `indiceDeZona`.
//
// La confianza que devuelve esta funcion refleja esa debilidad a proposito:
// mientras el indice sea este, ningun valor pasa de 0,5.
// ---------------------------------------------------------------------------

import { MUNICIPIOS } from "@/datos/municipios";
import type { TipoBien } from "@/lib/tipos";

const PORNOMBRE = new Map(MUNICIPIOS.map((m) => [normalizar(m.nombre), m]));

function normalizar(v: string): string {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export interface IndiceZona {
  eurM2: number;
  fuente: string;
  confianzaBase: number;
}

/** Precio de referencia por metro construido. Punto unico de sustitucion. */
export function indiceDeZona(municipio: string | null): IndiceZona | null {
  if (!municipio) return null;
  const m = PORNOMBRE.get(normalizar(municipio));
  if (!m) return null;
  return {
    eurM2: m.eurM2,
    fuente: "Tabla de referencia interna (provisional)",
    confianzaBase: 0.4,
  };
}

/** Cuanto se aparta del precio medio del municipio cada tipo de inmueble. */
const FACTOR_TIPO: Partial<Record<TipoBien, number>> = {
  vivienda: 1, oficina: 0.95, local: 0.75, nave: 0.45,
  garaje: 0.55, trastero: 0.4, edificio: 0.8,
};

export interface Valoracion {
  precioM2Zona: number;
  valorEstimado: number;
  confianza: number;
  fuente: string;
  notas: string[];
}

export function valorar(entrada: {
  municipio: string | null;
  tipo: TipoBien;
  m2Construidos: number | null;
  anioConstruccion: number | null;
  anioActual?: number;
}): Valoracion | null {
  const indice = indiceDeZona(entrada.municipio);
  if (!indice) return null;
  if (!entrada.m2Construidos || entrada.m2Construidos <= 0) return null;

  // Suelo y rustica no se valoran por metro construido: no lo tienen.
  if (entrada.tipo === "suelo" || entrada.tipo === "rustica") return null;

  const notas: string[] = [];
  let eurM2 = indice.eurM2 * (FACTOR_TIPO[entrada.tipo] ?? 0.7);
  if (FACTOR_TIPO[entrada.tipo] === undefined) {
    notas.push("Tipo de inmueble sin factor propio: se aplica un descuento general.");
  }

  // La antiguedad descuenta hasta un 25%, con suelo: un piso de 1960 en buen
  // estado no vale la mitad que uno nuevo.
  const anioActual = entrada.anioActual ?? new Date().getFullYear();
  let confianza = indice.confianzaBase;
  if (entrada.anioConstruccion && entrada.anioConstruccion > 1800) {
    const edad = Math.max(0, anioActual - entrada.anioConstruccion);
    const descuento = Math.min(0.25, edad * 0.004);
    eurM2 *= 1 - descuento;
    confianza += 0.1;
  } else {
    notas.push("Sin año de construcción: no se ajusta por antigüedad.");
  }

  const precioM2Zona = Math.round(eurM2);
  const valorEstimado = Math.round((precioM2Zona * entrada.m2Construidos) / 500) * 500;

  notas.push("Estimación por zona, no es una tasación.");

  return {
    precioM2Zona,
    valorEstimado,
    confianza: Math.min(0.5, Math.round(confianza * 100) / 100),
    fuente: indice.fuente,
    notas,
  };
}
