// ---------------------------------------------------------------------------
// Parseo de direcciones espanolas al formato que pide el Catastro.
//
// Las direcciones de los anuncios vienen escritas a mano por cada juzgado:
// "Calle Mayor, 5", "C/ Mayor nº 5, 3º B", "AV DEL PUERTO 14". Hay que sacar
// de ahi una sigla de via, un nombre y un numero.
//
// Funcion pura para poder probarla (tests/direccion.test.ts).
// ---------------------------------------------------------------------------

export interface DireccionPartida {
  sigla: string;
  nombre: string;
  numero: string | null;
}

/** Siglas de via del Catastro. La clave es como lo escribe la gente. */
const SIGLAS: Array<[RegExp, string]> = [
  // Muchos anuncios ya vienen con el codigo del Catastro ("CL JOSE BARTRINA 49"),
  // asi que cada entrada reconoce tambien su propio codigo.
  [/^(cl|c\/|c\.|calle|carrer|rua|kalea)$/i, "CL"],
  [/^(av|avd|avda|avenida|avinguda|etorbidea)$/i, "AV"],
  [/^(pz|pl|pza|plza|plaza|placa|plaça)$/i, "PZ"],
  [/^(ps|paseo|passeig)$/i, "PS"],
  [/^(cm|camino|cami|camí)$/i, "CM"],
  [/^(ctra|carretera|crta|cr)$/i, "CR"],
  [/^(rd|ronda)$/i, "RD"],
  [/^(tr|travesia|travessera|trav)$/i, "TR"],
  [/^(gl|glorieta)$/i, "GL"],
  [/^(pg|poligono|polígono|poligon)$/i, "PG"],
  [/^(ur|urb|urbanizacion|urbanización)$/i, "UR"],
  [/^(bo|br|barrio|barri)$/i, "BO"],
  [/^(gv|gran via|granvia)$/i, "GV"],
  [/^(ca|caserio|caserío)$/i, "CA"],
  [/^(lg|lugar)$/i, "LG"],
];

/** Lo que va detras del numero y hay que tirar: piso, puerta, escalera. */
const COLA = /\b(piso|pta|puerta|pl|planta|esc|escalera|bl|bloque|portal|bajo|ático|atico|dcha|izq|izda|derecha|izquierda)\b.*$/i;

function normalizar(v: string): string {
  return v
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function siglaDe(palabra: string): string | null {
  const limpia = normalizar(palabra).toLowerCase().replace(/\.$/, "");
  for (const [patron, sigla] of SIGLAS) if (patron.test(limpia)) return sigla;
  return null;
}

/**
 * Parte una direccion escrita a mano. Devuelve null cuando no hay suficiente
 * para buscar: sin nombre de via no hay nada que preguntarle al Catastro.
 */
export function partirDireccion(entrada: string | null | undefined): DireccionPartida | null {
  if (!entrada) return null;

  // Se corta en la primera coma solo si lo que sigue no es el numero.
  let texto = normalizar(entrada);
  if (!texto) return null;

  // "Calle Mayor, 5, 3º B" -> quitamos piso y puerta.
  texto = texto.replace(COLA, "").trim();
  texto = texto.replace(/\b\d+\s*[ºª°]\s*[a-zA-Z]?\b/g, " ").replace(/\s+/g, " ").trim();

  const partes = texto.split(/\s+/);
  if (partes.length === 0) return null;

  // Sigla: puede ocupar una palabra ("Calle") o dos ("Gran Via").
  let sigla = "CL";
  let desde = 0;
  const dos = partes.length >= 2 ? siglaDe(`${partes[0]} ${partes[1]}`) : null;
  const una = siglaDe(partes[0]!);
  if (dos) { sigla = dos; desde = 2; }
  else if (una) { sigla = una; desde = 1; }

  const resto = partes.slice(desde).join(" ")
    .replace(/^[,\s]+/, "")
    .replace(/[,;\s]+$/, "");
  if (!resto) return null;

  // El numero es el ultimo grupo de digitos suelto, con o sin "nº" delante.
  const conNumero = /^(.*?)[,\s]*(?:n[ºo°.]?\s*)?(\d+[a-zA-Z]?)\s*$/.exec(resto);
  let nombre = resto;
  let numero: string | null = null;
  if (conNumero && conNumero[1]!.trim()) {
    nombre = conNumero[1]!.trim();
    numero = conNumero[2]!.replace(/[a-zA-Z]$/, "");
  }

  nombre = normalizar(nombre).replace(/[,.]+$/, "").trim().toUpperCase();
  // "DE LA ESTACION" se busca mejor sin el articulo inicial, pero el Catastro
  // guarda el nombre completo: se deja tal cual y es el servicio quien decide.
  if (!nombre) return null;

  return { sigla, nombre, numero };
}

// ---------------------------------------------------------------------------
// Referencias catastrales tal y como las escriben los juzgados.
//
// De 888 referencias en anuncios reales (26 de octubre de 2026), 117 no
// tenian ni 14 ni 20 caracteres: con un punto final ("0295605QA6609E0001EZ."),
// con barras o guiones entre los bloques ("1649914/DF3814H/0021/QO"), con un
// texto que no es una referencia ("NOCONSTA", "Nocoordinada", "NO") o con un
// caracter de menos, que no tiene arreglo. Preguntarle al Catastro por
// "NOCONSTA" es una peticion perdida y un fallo que esconde el fallo real.
// ---------------------------------------------------------------------------

/**
 * Deja una referencia catastral en los 14 (parcela) o 20 (inmueble)
 * caracteres que entiende el Catastro, o null si lo que hay no es una
 * referencia. No se toca el dato de origen: esto solo decide con que se
 * pregunta.
 */
export function limpiarReferenciaCatastral(entrada: string | null | undefined): string | null {
  if (!entrada) return null;
  const limpia = entrada.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (limpia.length !== 14 && limpia.length !== 20) return null;
  // Una referencia de verdad lleva digitos y letras mezclados; "NOCOORDINADO"
  // o un numero de finca registral no.
  if (!/\d/.test(limpia) || !/[A-Z]/.test(limpia)) return null;
  return limpia;
}
