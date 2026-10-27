// ---------------------------------------------------------------------------
// Elegir, entre lo que devuelve un servicio, el municipio, la via o la
// poblacion que corresponde a lo que escribio el juzgado.
//
// El Catastro quiere los nombres exactos: "CREVILLENT" y no "CREVILLENTE",
// "SASTRES, DELS" y no "DELS SASTRES", "SANTA LUCIA DE TIRAJANA" y no "SANTA
// LUCIA". Pero sus consultas de lista (ConsultaMunicipio, ConsultaVia) admiten
// un trozo del nombre y devuelven los oficiales, asi que la cadena pregunta
// por el trozo y aqui se decide cual de los candidatos es el bueno. La regla
// que manda es la misma que en direccion.ts: ante la duda, ninguno. Un portal
// de otra calle pintado en el mapa es peor que el centro del municipio.
//
// Funciones puras, probadas en tests/coincidir.test.ts. Medido sobre la base
// real el 27 de octubre de 2026 (README, "Enriquecimiento con el Catastro").
// ---------------------------------------------------------------------------

/** Mayusculas sin acentos, con la Ñ y la Ç, el guion como espacio ("VELEZ-
 *  MALAGA" y "VÉLEZ MÁLAGA" son el mismo) y el articulo pospuesto delante
 *  ("PALMAS, LAS" -> "LAS PALMAS"; "SASTRES, DELS" -> "DELS SASTRES"). */
export function normalizarNombre(v: string): string {
  // Fuera todos los diacriticos combinantes menos la tilde de la eñe (U+0303)
  // y la cedilla (U+0327), como en direccion.ts.
  let n = v.normalize("NFD").replace(/[̀-̂̄-̨̦-ͯ]/g, "").normalize("NFC")
    .toUpperCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
  // "OROTAVA (LA)" y "PALMAS, LAS": el articulo, delante.
  const pospuesto = /^(.+?)\s*(?:,\s*|\(\s*)(A|LA|LAS|EL|LOS|LES|ILLES|ELS|DELS|DEL|DE LA|DE LES|DE LOS|DE LAS|D'|L'|SA|SES|ES|O|OS|AS|DA|DO|DAS|DOS|NA|NO)\s*\)?$/.exec(n);
  if (pospuesto) n = `${pospuesto[2]}${/['’]$/.test(pospuesto[2]!) ? "" : " "}${pospuesto[1]}`;
  return n.replace(/\s+/g, " ").trim();
}

// Nombres castellanos de municipios cuyo unico nombre oficial es el otro.
// Los bilingües ("Elx/Elche", "Alacant/Alicante") ya vienen dobles en las
// dos fuentes y no hacen falta aqui.
const NOMBRES_OFICIALES: Record<string, string> = {
  "IBIZA": "EIVISSA",
  "PALMA DE MALLORCA": "PALMA",
  "MAHON": "MAO",
};

/** Las formas de un nombre: el entero, las mitades de un bilingüe
 *  ("ALBORAIA/ALBORAYA", "MOIXENT / MOGENTE", "Donostia-San Sebastián"), las
 *  partes separadas por coma o entre parentesis ("Cabo Blanco, Arona", "SAN
 *  PEDRO DE ALCANTARA ( MARBELLA )") y el nombre oficial de los exonimos.
 *  Todas normalizadas. */
function mitades(v: string): string[] {
  const formas = new Set<string>();
  const entero = normalizarNombre(v);
  if (entero) formas.add(entero);
  for (const m of v.split(/\/|-|,|\(|\)/)) {
    const n = normalizarNombre(m);
    if (n && n.length >= 4) formas.add(n);
  }
  for (const f of [...formas]) {
    const oficial = NOMBRES_OFICIALES[f];
    if (oficial) formas.add(oficial);
  }
  return [...formas];
}

/** Iguales letra por letra, con o sin espacios ("VILASECA" y "VILA-SECA") o
 *  sin las palabras vacias ("PARACUELLOS DEL JARAMA" y "PARACUELLOS DE
 *  JARAMA", "JEREZ FRONTERA" y "JEREZ DE LA FRONTERA"). */
function mismoNombre(a: string, b: string): boolean {
  if (a === b || a.replace(/ /g, "") === b.replace(/ /g, "")) return true;
  const pa = palabrasDeVia(a).join(" ");
  const pb = palabrasDeVia(b).join(" ");
  return pa.length > 0 && pa === pb;
}

/**
 * Si el nombre del anuncio y uno oficial son el mismo municipio: iguales, o
 * iguales a una de las mitades del bilingüe, o uno sigue con mas palabras
 * ("SANTA LUCIA" / "SANTA LUCIA DE TIRAJANA", "BENALMADENA COSTA" /
 * "BENALMADENA"), o se diferencian en una o dos letras al final
 * ("CREVILLENTE" / "CREVILLENT"). Nada mas: "SANTA" no es un municipio. Quien
 * llama mira antes si hay uno exacto, para que "MALAGA" no acabe en "MALAGA
 * DEL FRESNO" cuando "MALAGA" esta en la lista.
 */
export function mismoMunicipio(anuncio: string, oficial: string): boolean {
  for (const nuestro of mitades(anuncio)) {
    if (nuestro.length < 4) continue;
    for (const suyo of mitades(oficial)) {
      if (mismoNombre(suyo, nuestro)) return true;
      if (suyo.startsWith(`${nuestro} `) || nuestro.startsWith(`${suyo} `)) return true;
      const corto = suyo.length < nuestro.length ? suyo : nuestro;
      const largo = suyo.length < nuestro.length ? nuestro : suyo;
      if (largo.startsWith(corto) && largo.length - corto.length <= 2 && !/\s/.test(largo.slice(corto.length))) return true;
    }
  }
  return false;
}

/**
 * El municipio oficial que corresponde al del anuncio, o null si ninguno o
 * varios encajan. Devuelve el nombre tal cual lo da el servicio, que es lo
 * que hay que mandarle despues ("MONOVAR/MONOVER" entero).
 */
export function elegirMunicipio(anuncio: string, oficiales: string[]): string | null {
  const nuestras = mitades(anuncio);
  const exactos = oficiales.filter((o) => mitades(o).some((m) => nuestras.some((n) => mismoNombre(m, n))));
  if (exactos.length === 1) return exactos[0]!;
  if (exactos.length > 1) return null;
  const parecidos = oficiales.filter((o) => mismoMunicipio(anuncio, o));
  return parecidos.length === 1 ? parecidos[0]! : null;
}

// Palabras que no distinguen una calle de otra: articulos, preposiciones y
// conjunciones en castellano, catalan, gallego y balear. Quedan fuera al
// comparar nombres, porque el Catastro las pone, las quita o las pospone a
// su aire ("CONSTITUCION" en Laguna de Duero, "SASTRES, DELS" en Olot).
const VACIAS = new Set([
  "DE", "DEL", "DELS", "LA", "EL", "LOS", "LAS", "LES", "ELS", "L", "D", "S", "N",
  "DA", "DO", "DAS", "DOS", "NA", "NO", "SA", "SES", "ES", "SO", "A", "AL", "Y", "I",
  "E", "EN", "O", "OS", "AS", "DES",
]);

/** Las palabras con peso de un nombre de via, en orden y sin repetir. */
export function palabrasDeVia(nombre: string): string[] {
  const vistas = new Set<string>();
  for (const p of normalizarNombre(nombre).split(/[^0-9A-ZÑÇ]+/)) {
    if (p && !VACIAS.has(p)) vistas.add(p);
  }
  return [...vistas];
}

/** La palabra por la que preguntar a ConsultaVia: la mas larga con peso, que
 *  es la que menos candidatos devuelve. Null si no hay ninguna de tres letras. */
export function palabraClaveDeVia(nombre: string): string | null {
  const palabras = palabrasDeVia(nombre).filter((p) => p.length >= 3 && /[A-ZÑÇ]/.test(p));
  if (palabras.length === 0) return null;
  return palabras.reduce((mejor, p) => (p.length > mejor.length ? p : mejor));
}

export interface ViaOficial {
  /** Tipo de via del Catastro ("CL", "AV"...). */
  tv: string;
  /** Nombre exacto, tal cual lo quiere Consulta_DNPLOC ("SASTRES, DELS"). */
  nv: string;
}

/**
 * La via oficial que corresponde a la del anuncio, o null. Encaja si tiene
 * todas las palabras con peso del anuncio ("MIGUEL HERNANDEZ" encaja con
 * "POETA MIGUEL HERNANDEZ"); gana la que no tiene ninguna de mas, y entre
 * iguales la del mismo tipo de via. Si al final quedan dos, ninguna.
 */
export function elegirVia(anuncio: { sigla: string; nombre: string }, oficiales: ViaOficial[]): ViaOficial | null {
  const nuestras = palabrasDeVia(anuncio.nombre);
  if (nuestras.length === 0) return null;
  const encajan = oficiales
    .map((v) => ({ via: v, palabras: palabrasDeVia(v.nv) }))
    .filter((c) => nuestras.every((p) => c.palabras.includes(p)));
  const desempatar = (lista: typeof encajan): ViaOficial | null => {
    if (lista.length === 1) return lista[0]!.via;
    if (lista.length === 0) return null;
    const mismoTipo = lista.filter((c) => c.via.tv.toUpperCase() === anuncio.sigla.toUpperCase());
    return mismoTipo.length === 1 ? mismoTipo[0]!.via : null;
  };
  const exactas = encajan.filter((c) => c.palabras.length === nuestras.length);
  return desempatar(exactas) ?? (exactas.length === 0 ? desempatar(encajan) : null);
}

// ---------------------------------------------------------------------------
// Poblaciones de CartoCiudad (IGN), para el centro del municipio.
// ---------------------------------------------------------------------------

export interface CandidatoCartoCiudad {
  id: string;
  /** "poblacion" (nucleo urbano), "Municipio" (termino entero), "callejero",
   *  "toponimo"... Cualquiera sirve para saber el codigo INE del municipio. */
  type: string;
  muni: string;
  /** Codigo INE del municipio, con el que find?type=Municipio da su centro. */
  muniCode: string | null;
  province: string;
  poblacion: string | null;
}

/** Lo que hay que pedirle a CartoCiudad para situar el elegido. */
export interface PoblacionElegida {
  id: string;
  type: "poblacion" | "Municipio";
  nombre: string;
}

/** El nombre oficial de un exonimo ("IBIZA" -> "EIVISSA"), o null. Para
 *  preguntar tambien por el, porque CartoCiudad no conoce el castellano. */
export function nombreOficialDe(municipio: string): string | null {
  return NOMBRES_OFICIALES[normalizarNombre(municipio)] ?? null;
}

// Como escribe cada fuente la provincia. El portal del BOE pone el nombre
// castellano o el doble; CartoCiudad el oficial o el doble al reves.
const PROVINCIAS_EQUIVALENTES: Array<string[]> = [
  ["VIZCAYA", "BIZKAIA"], ["GUIPUZCOA", "GIPUZKOA"], ["ALAVA", "ARABA"],
  ["GERONA", "GIRONA"], ["LERIDA", "LLEIDA"], ["ORENSE", "OURENSE"],
  ["LA CORUÑA", "A CORUÑA", "CORUÑA"], ["BALEARES", "ISLAS BALEARES", "ILLES BALEARS"],
  ["CASTELLON", "CASTELLO"], ["ALICANTE", "ALACANT"], ["VALENCIA"],
  ["SANTA CRUZ DE TENERIFE", "TENERIFE"], ["LAS PALMAS"],
];

function formasDeProvincia(v: string): Set<string> {
  const formas = new Set(mitades(v));
  for (const grupo of PROVINCIAS_EQUIVALENTES) {
    if (grupo.some((g) => formas.has(g))) for (const g of grupo) formas.add(g);
  }
  return formas;
}

/** Si dos provincias escritas de cualquier manera son la misma. */
export function mismaProvincia(a: string, b: string): boolean {
  const fa = formasDeProvincia(a);
  for (const f of formasDeProvincia(b)) if (fa.has(f)) return true;
  return false;
}

/**
 * Entre los candidatos de CartoCiudad, el que es ese municipio en esa
 * provincia. Primero la poblacion que lleva el nombre del municipio (el nucleo
 * principal, donde esta el ayuntamiento); si no la hay, el municipio entero,
 * cuyo centro es el del termino y puede caer lejos del pueblo. Y si lo que
 * escribio el juzgado no es un municipio sino una localidad de otro
 * ("Trobajo del Camino", de San Andres del Rabanedo; "Portonovo", de
 * Sanxenxo), la poblacion de la misma provincia que se llama exactamente asi.
 */
export function elegirPoblacion(
  municipio: string,
  provincia: string,
  candidatos: CandidatoCartoCiudad[],
): PoblacionElegida | null {
  const nuestras = mitades(municipio);
  const deLaProvincia = candidatos.filter((c) => mismaProvincia(provincia, c.province));
  // Con el nombre exacto no se mira mas: "MALAGA" no es "MALAGA DEL FRESNO".
  const exactos = deLaProvincia.filter((c) => mitades(c.muni).some((m) => nuestras.some((n) => mismoNombre(m, n))));
  const delMunicipio = exactos.length > 0
    ? exactos
    : deLaProvincia.filter((c) => mismoMunicipio(municipio, c.muni));
  const nucleo = delMunicipio.find((c) =>
    c.type === "poblacion" && c.poblacion != null && mitades(c.poblacion).some((p) => mitades(c.muni).includes(p)));
  if (nucleo) return { id: nucleo.id, type: "poblacion", nombre: nucleo.poblacion ?? nucleo.muni };
  // Sin nucleo a la vista, el termino entero por su codigo INE, que trae
  // cualquier candidato del municipio (una calle, un toponimo). Si los
  // candidatos son de dos municipios distintos, ninguno.
  const codigos = new Set(delMunicipio.map((c) => c.muniCode).filter((v): v is string => Boolean(v)));
  if (codigos.size === 1) {
    const [codigo] = codigos;
    return { id: codigo!, type: "Municipio", nombre: delMunicipio[0]!.muni };
  }
  if (delMunicipio.length > 0) return null;
  const localidades = deLaProvincia.filter((c) =>
    c.type === "poblacion" && c.poblacion != null && mitades(c.poblacion).some((p) => nuestras.some((n) => mismoNombre(p, n))));
  const localidad = localidades[0];
  return localidades.length === 1 && localidad ? { id: localidad.id, type: "poblacion", nombre: localidad.poblacion ?? localidad.muni } : null;
}
