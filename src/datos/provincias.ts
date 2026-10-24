// Provincia -> comunidad autonoma. Hace falta para el ITP, que es competencia
// autonomica: sin comunidad la calculadora aplica el tipo mas alto por
// prudencia. Los nombres de comunidad son exactamente las claves de
// src/datos/itp.ts.
//
// El Portal de Subastas escribe la provincia de varias formas segun la
// pestaña: "Murcia", "Coruña, A", "CORUÑA, A", "Alicante/Alacant". Por eso se
// busca por nombre normalizado (sin acentos, minusculas, sin articulo
// pospuesto) y se admiten los alias que hemos visto.

const COMUNIDADES: Record<string, string[]> = {
  "Andalucía": ["almeria", "cadiz", "cordoba", "granada", "huelva", "jaen", "malaga", "sevilla"],
  "Aragón": ["huesca", "teruel", "zaragoza"],
  "Asturias": ["asturias", "principado de asturias", "oviedo"],
  "Baleares": ["illes balears", "islas baleares", "baleares", "balears"],
  "Canarias": ["las palmas", "santa cruz de tenerife", "tenerife"],
  "Cantabria": ["cantabria", "santander"],
  "Castilla-La Mancha": ["albacete", "ciudad real", "cuenca", "guadalajara", "toledo"],
  "Castilla y León": ["avila", "burgos", "leon", "palencia", "salamanca", "segovia", "soria", "valladolid", "zamora"],
  "Cataluña": ["barcelona", "girona", "gerona", "lleida", "lerida", "tarragona"],
  "Ceuta": ["ceuta"],
  "Comunidad de Madrid": ["madrid"],
  "Comunidad Valenciana": ["alicante", "alacant", "alicante/alacant", "castellon", "castello", "castellon/castello", "valencia", "valencia/valencia"],
  "Extremadura": ["badajoz", "caceres"],
  "Galicia": ["a coruna", "coruna", "la coruna", "lugo", "ourense", "orense", "pontevedra"],
  "La Rioja": ["la rioja", "rioja", "logrono"],
  "Melilla": ["melilla"],
  "Murcia": ["murcia", "region de murcia"],
  "Navarra": ["navarra", "nafarroa", "comunidad foral de navarra"],
  "País Vasco": ["araba", "alava", "araba/alava", "bizkaia", "vizcaya", "gipuzkoa", "guipuzcoa"],
};

const POR_PROVINCIA = new Map<string, string>();
for (const [comunidad, nombres] of Object.entries(COMUNIDADES)) {
  for (const n of nombres) POR_PROVINCIA.set(n, comunidad);
}

function normalizar(nombre: string): string {
  let n = nombre
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  // "coruna, a" -> "a coruna"; "palmas, las" -> "las palmas"; "rioja, la" -> "la rioja".
  const pospuesto = /^(.+),\s*(a|la|las|el|los|les|illes)$/.exec(n);
  if (pospuesto) n = `${pospuesto[2]} ${pospuesto[1]}`;
  return n;
}

/** Comunidad autonoma de una provincia escrita como la escriba la fuente. */
export function comunidadDeProvincia(provincia: string | null | undefined): string | null {
  if (!provincia) return null;
  const n = normalizar(provincia);
  const directa = POR_PROVINCIA.get(n);
  if (directa) return directa;
  // "Valencia/València": basta con que una de las dos mitades sea conocida.
  for (const parte of n.split("/")) {
    const c = POR_PROVINCIA.get(parte.trim());
    if (c) return c;
  }
  return null;
}
