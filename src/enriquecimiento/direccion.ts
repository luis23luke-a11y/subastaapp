// ---------------------------------------------------------------------------
// Parseo de direcciones espanolas al formato que pide el Catastro.
//
// Las direcciones de los anuncios vienen escritas a mano por cada juzgado:
// "Calle Mayor, 5", "C/ Mayor nº 5, 3º B", "AV DEL PUERTO 14". Y muchas
// vienen ya en el formato del propio Catastro, que es el que copia el
// juzgado de la nota simple: "CL CHARCO 0" (el 0 es "sin numero"),
// "CL BEBRICIO 33 01 C" (numero, planta y puerta separados por espacios),
// "AV GARRAF 26(B) Es:1 Pl:01 Pt:01". Hay que sacar de ahi una sigla de via,
// un nombre y un numero de portal.
//
// La regla que manda es no inventar numero: un portal equivocado pintado en
// el mapa es peor que el centro del municipio. Por eso el numero es el
// primer numero suelto que sigue al nombre, y solo si nada antes de el dice
// que no es un portal (una parcela, un bloque, un apartamento, un kilometro).
//
// Funciones puras para poder probarlas (tests/direccion.test.ts). Las
// convenciones del Catastro que se aplican aqui (que conserva la Ñ y la Ç
// pero no los acentos, que PL es poligono y PD partida, como nombra las
// provincias) se comprobaron contra su servicio real el 26 de octubre de
// 2026; el README lo cuenta en "Enriquecimiento con el Catastro".
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
  [/^(c|cl|cll|c\/|calle|carrer|rua|kalea)$/i, "CL"],
  [/^(av|avd|avda|avgda|avenida|avinguda|etorbidea)$/i, "AV"],
  [/^(pz|pl|pza|plza|plaza|placa|plaça|plazaça)$/i, "PZ"],
  [/^(ps|pº|paseo|passeig|pseo)$/i, "PS"],
  [/^(cm|camino|cami|camí|cmno|cno)$/i, "CM"],
  [/^(ctra|carretera|crta|cr)$/i, "CR"],
  [/^(rd|ronda)$/i, "RD"],
  [/^(tr|travesia|travessia|travessera|trav|trva)$/i, "TR"],
  [/^(gl|glorieta)$/i, "GL"],
  // El Catastro llama PL al poligono (comprobado: "PL POLIG INDUSTR MIRAVAL"
  // en Huelva, "PL ALBA L'" en Vila-seca). PG era una suposicion antigua.
  [/^(pg|poligono|polígono|poligon|polígon|pol|polig)$/i, "PL"],
  [/^(ur|urb|urbanizacion|urbanización|urbanitzacio|urbanització)$/i, "UR"],
  [/^(bo|br|barrio|barri)$/i, "BO"],
  [/^(gv|gran via|granvia)$/i, "GV"],
  [/^(ca|caserio|caserío)$/i, "CA"],
  [/^(lg|lugar)$/i, "LG"],
  [/^(pd|partida|ptda|pda)$/i, "PD"],
  [/^(pj|pje|psje|pasaje|passatge|pasadizo)$/i, "PJ"],
  [/^(rb|rbla|rambla)$/i, "RB"],
  [/^(cj|callejon|callejón|calleja)$/i, "CJ"],
  [/^(ct|cuesta|costanilla)$/i, "CT"],
  [/^(pq|parque)$/i, "PQ"],
  [/^(pt|puente)$/i, "PT"],
  [/^(ds|diseminado|diseminados)$/i, "DS"],
  [/^(vr|vereda)$/i, "VR"],
  [/^(sd|senda)$/i, "SD"],
  [/^(pa|paraje)$/i, "PA"],
];

// Codigos de via del Catastro que se aceptan tal cual cuando el juzgado ya
// escribe en su formato ("PL J-1 P FLAMENCA NORTE 66", "DS HIJUELA"). Van
// en mayusculas y sin punto; una palabra en minusculas o con punto pasa por
// la tabla de arriba, porque "Pl." escrito a mano es una plaza y "PL" del
// Catastro es un poligono. Faltan a proposito los codigos que tambien son
// palabras ("DE", "EN", "ES", "SN", "AL", "SU", "SA"): una direccion que
// empieza por "EN un edificio..." no es una entrada.
const CODIGOS_CATASTRO = new Set([
  "AP", "AY", "AV", "BJ", "BO", "BR", "CA", "CG", "CH", "CI", "CJ", "CL", "CM",
  "CN", "CO", "CP", "CR", "CS", "CT", "CU", "CY", "DP", "DS", "ED", "EM", "ER",
  "EX", "FC", "FN", "GL", "GR", "GV", "HT", "JR", "LD", "LG", "MC", "ML", "MN",
  "MS", "MT", "MZ", "PA", "PB", "PD", "PG", "PJ", "PL", "PM", "PQ", "PR", "PS",
  "PT", "PZ", "QT", "RB", "RC", "RD", "RM", "RP", "RR", "RU", "SD", "SL", "TN",
  "TO", "TR", "UR", "VR",
]);

// Palabras que, delante de un numero, dicen que ese numero no es un portal:
// "parcela 124", "bloque 2", "apartamento 607", "km 676", "plaza 93" (de
// garaje). Al encontrarlas se deja de buscar: lo que sigue describe la
// unidad, no la calle. No estan "bajo" ni "bajos", que son nombres de calle
// ("Corrales Bajos", "Tiradores Bajos", "Ollerias Bajas").
const NO_ES_PORTAL = new Set([
  "parcela", "parcelas", "parcel", "poligono", "plg", "polig", "manzana",
  "sector", "sectores", "km", "kilometro", "kilometros", "finca", "registro",
  "fase", "bloque", "bl", "blq", "bq", "portal", "local", "locales", "nave",
  "apartamento", "apartamentos", "apto", "apartado", "dpto", "depto",
  "departamento", "departm", "plaza", "garaje", "trastero", "puerta", "pta",
  "pto", "piso", "planta", "pl", "plta", "escalera", "esc", "nivel", "sotano",
  "edificio", "edif", "cp", "tipo", "letra", "vivienda", "viv", "unidad", "ue",
  "aparcamiento", "modulo", "oficina", "despacho", "lote",
]);

// Abreviaturas que llevan punto dentro de un nombre de calle y no cierran
// el nombre: "Dr. Fleming", "Ntra. Sra. del Rosario", "Gral. Mola".
const ABREVIATURAS = new Set([
  "dr", "dra", "d", "dña", "sta", "sto", "s", "san", "ntra", "ntro", "sra", "sr",
  "gral", "cte", "cmte", "mtro", "pte", "fco", "ma", "mª", "avda", "av", "urb",
  "pza", "ctra", "bda", "c", "cl", "pl", "ps", "pº", "n", "nº", "num", "ing",
  "arq", "prof", "pdte", "rvdo", "mn", "st",
]);

/**
 * Quita acentos pero conserva la Ñ y la Ç, que para el Catastro son letras
 * distintas: "MUÑOZ SECA" existe en Armilla y "MUNOZ SECA" no; "LLANÇA"
 * existe y "LLANCA" no. Los acentos sí sobran: "LLANÇÀ" no existe. Comprobado
 * contra el servicio el 26 de octubre de 2026. Se quitan todos los signos
 * diacriticos combinantes menos la tilde de la eñe (U+0303) y la cedilla
 * (U+0327).
 */
function sinAcentos(v: string): string {
  return v.normalize("NFD").replace(/[̀-̂̄-̨̦-ͯ]/g, "").normalize("NFC");
}

function normalizar(v: string): string {
  return sinAcentos(v)
    .replace(/[’´`]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function siglaDe(palabra: string): string | null {
  const limpia = normalizar(palabra).toLowerCase().replace(/\.$/, "");
  for (const [patron, sigla] of SIGLAS) if (patron.test(limpia)) return sigla;
  return null;
}

/** "Nº 5", "n.º 5", "núm. 5", "número 5", "n 5", "n5" -> "5". Solo delante de
 *  un digito, y solo si la n es una palabra entera: "Juan 5" no se toca. */
const MARCA_NUMERO = /\b(?:n[uú]mero|n[uú]m|nro|n)\s*\.?\s*[ºª°]?\s*\.?\s*(?=\d)/gi;

/** "s/n", "s.n.", "SN", "sin número", "sin num.". Todo lo que sigue sobra. */
const SIN_NUMERO = /(?:^|[\s,.;(-])(?:s\/n|s\.n\.?|sn|s-n|sin\s+n[uú]m(?:ero)?\.?|sin\s+n[ºo°])(?=$|[\s,.;)\-])/i;

/** El formato del Catastro para escalera, planta y puerta: "Es:1 Pl:01 Pt:B". */
const UNIDAD_CATASTRO = /\b(?:es|pl|pt|bl|esc|pta)\s*:/i;

/**
 * Si el token es un numero de portal devuelve su valor; si es un ordinal
 * ("3º"), un kilometraje ("2.1"), un codigo postal (cinco cifras) o un
 * numero con cero delante ("0172") devuelve null. El 0 del Catastro es
 * "sin numero" y vale 0 para que quien llama lo distinga de "no es numero".
 */
function numeroDePortal(token: string): number | null {
  const limpio = token.replace(/[,.;:\-]+$/, "");
  const m = /^(\d{1,4})(.*)$/.exec(limpio);
  if (!m) return null;
  const digitos = m[1]!;
  const resto = m[2]!;
  if (digitos.length > 1 && digitos.startsWith("0")) return null;
  // Lo que puede ir pegado al numero sin que deje de ser un portal: una
  // letra ("25B", "26(B)", "2(D)"), "bis", un rango ("9-11-13", "62-68") o
  // el piso detras de un guion ("2-1ºC" es el 2). Un ordinal ("3º") no es
  // un portal, ni "2.1" ni "1.1".
  if (resto === "" || /^(?:\(?[a-zA-Z]\)?|bis|-.*)$/i.test(resto)) return Number.parseInt(digitos, 10);
  return null;
}

interface Analisis {
  sigla: string;
  nombreTokens: string[];
  numero: string | null;
  /** Posicion del token del numero en `partes`, o -1. */
  indiceNumero: number;
  /** Si la direccion traia sigla escrita ("CALLE 3": el 3 es el nombre). */
  conSigla: boolean;
}

/** Sigla, nombre y numero de una lista de tokens ya normalizados. */
function analizar(partes: string[]): Analisis | null {
  // Sigla: puede ocupar una palabra ("Calle") o dos ("Gran Via"). Un codigo
  // del Catastro en mayusculas va tal cual.
  let sigla = "CL";
  let desde = 0;
  const primera = partes[0] ?? "";
  const dos = partes.length >= 2 ? siglaDe(`${partes[0]} ${partes[1]}`) : null;
  if (partes.length >= 2 && CODIGOS_CATASTRO.has(primera)) { sigla = primera; desde = 1; }
  else if (dos) { sigla = dos; desde = 2; }
  else {
    const una = siglaDe(primera);
    if (una) { sigla = una; desde = 1; }
  }

  let resto = partes.slice(desde).join(" ");
  // "Gran Via 22": la sigla de dos palabras era el nombre entero.
  if (desde === 2 && !/[a-zñç]/i.test(resto)) { sigla = "CL"; desde = 0; resto = partes.join(" "); }
  if (!resto.trim()) return null;

  // "s/n" y el formato de unidad del Catastro cierran la direccion: lo que
  // hay delante es el nombre y no hay numero. Va antes de quitar el "nº"
  // para que la n de "s/n" no se tome por una marca de numero.
  const corteSn = SIN_NUMERO.exec(resto);
  if (corteSn) resto = resto.slice(0, corteSn.index);
  const corteUnidad = UNIDAD_CATASTRO.exec(resto);
  if (corteUnidad) resto = resto.slice(0, corteUnidad.index);
  resto = resto.replace(MARCA_NUMERO, "").replace(/\s+/g, " ").trim();

  // El numero es el primer numero suelto que sigue al nombre. Un numero en
  // la primera posicion forma parte del nombre ("CALLE 3", "Carrer 11 de
  // Setembre 5"). Una palabra de NO_ES_PORTAL antes del numero cierra la
  // busqueda: lo que sigue es la unidad, no la calle.
  const tokens = resto.split(" ").filter(Boolean);
  const nombreTokens: string[] = [];
  let numero: string | null = null;
  let indiceNumero = -1;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const palabra = token.toLowerCase().replace(/[.,;:]+$/, "");
    if (NO_ES_PORTAL.has(palabra)) break;
    const valor = numeroDePortal(token);
    if (valor != null && nombreTokens.some((t) => /[a-zñç]/i.test(t))) {
      if (valor > 0) {
        numero = String(valor);
        // El token original puede llevar el "nº" pegado ("nº3"): se busca
        // el primero cuyo primer grupo de cifras sea ese numero.
        indiceNumero = partes.findIndex((t, k) => k >= desde && /\d+/.exec(t)?.[0] === numero);
      }
      break;
    }
    nombreTokens.push(token);
  }
  return { sigla, nombreTokens, numero, indiceNumero, conSigla: desde > 0 };
}

/**
 * Parte una direccion escrita a mano. Devuelve null cuando no hay suficiente
 * para buscar: sin nombre de via no hay nada que preguntarle al Catastro.
 */
export function partirDireccion(entrada: string | null | undefined): DireccionPartida | null {
  if (!entrada) return null;

  let texto = normalizar(entrada);
  if (!texto) return null;

  // "C/SANABRIA", "AVDA.RONDA NORD", "Urb.Real Panorama": la sigla viene
  // pegada a la primera palabra del nombre.
  texto = texto.replace(/^c\/(?=\S)/i, "C/ ").replace(/^([a-zñç]+)\.(?=[a-zñç])/i, "$1. ");

  // Un parentesis con mas de una letra dentro es un inciso ("(SUELO
  // URBANIZABLE DELIMITADO ULD 14)", "(hoy 121)", "(bloque 10)") y su numero
  // no es el portal: fuera. "26(B)" y "2(D)" se quedan.
  texto = texto.replace(/\(([^)]*)\)/g, (todo, dentro: string) => (/^\s*[a-zA-Z]\s*$/.test(dentro) ? todo : " "));

  // Las comas y los parentesis se separan para que "6," o "26(B)" sean
  // tokens limpios.
  texto = texto.replace(/([,;()])/g, " $1 ").replace(/\s+/g, " ").trim();

  const partes = texto.split(" ");
  let analisis = analizar(partes);
  if (!analisis) return null;

  // "Lomas de Torreblanca, C/ Las Dalias 8": la calle de verdad viene
  // despues de una coma, detras del nombre de la urbanizacion o del paraje.
  // Si el numero aparecio despues de una sigla escrita que sigue a una coma,
  // se vuelve a partir desde esa sigla. Solo entonces: en "Miguel de Unamuno
  // 11-13, plaza de aparcamiento 8" el numero ya estaba antes de la coma.
  if (analisis.numero != null) {
    for (let i = analisis.indiceNumero - 1; i >= 1; i--) {
      if (partes[i - 1] === "," && siglaDe(partes[i]!) && /[a-zñç]/i.test(partes[i + 1] ?? "")) {
        analisis = analizar(partes.slice(i)) ?? analisis;
        break;
      }
    }
  }
  const { sigla, nombreTokens, numero, conSigla } = analisis;

  // El nombre se corta en la primera coma, punto y coma o parentesis: lo que
  // sigue es el municipio repetido ("AVENIDA DE LUGO , 94 , MELIDE"), el
  // paraje ("c/ de la Cruz. Espinardo") o la calle con la que hace esquina.
  let nombre = nombreTokens.join(" ");
  nombre = nombre.split(/\s*[,;()]\s*/)[0] ?? "";
  nombre = nombre.replace(/\s*-?\s*\b(?:con\s+)?(?:esquina|esq\.?)\b.*$/i, "");
  // "de la Cruz. Espinardo": un punto seguido de espacio tambien separa el
  // paraje, salvo que lo que haya delante sea una abreviatura ("Dr. Fleming").
  const punto = /^(.*?\b([a-zñç]+))\.\s/i.exec(nombre);
  if (punto && !ABREVIATURAS.has(punto[2]!.toLowerCase())) nombre = punto[1]!;
  nombre = nombre.replace(/[\s,.;:\-]+$/, "").replace(/^[\s,.;:\-]+/, "").toUpperCase();
  // "DE LA ESTACION": el Catastro unas veces guarda el articulo y otras no
  // ("DEL MAR" en Benalmadena, "CONSTITUCION" en Laguna de Duero). Se deja
  // tal cual y es geocodificar quien reintenta sin el si la via no existe.
  // Un nombre sin letras solo vale si venia con sigla ("CALLE 3"); un "1"
  // suelto no es una direccion.
  if (!nombre || (!conSigla && !/[A-ZÑÇ]/.test(nombre))) return null;

  return { sigla, nombre, numero };
}

/** Nombre sin el articulo inicial, o null si no lo tenia. Para el segundo
 *  intento cuando el Catastro dice que la via no existe. */
export function nombreSinArticulo(nombre: string): string | null {
  const corto = nombre
    .replace(/^(?:DE\s+LA|DE\s+LOS|DE\s+LAS|DEL|DE|LA|EL|LOS|LAS)\s+/, "")
    .replace(/^(?:DE\s+)?[DL]'\s*/, "")
    .trim();
  return corto && corto !== nombre ? corto : null;
}

// ---------------------------------------------------------------------------
// Provincia y municipio como los quiere el Catastro.
//
// El Portal de Subastas escribe "Málaga", "Alicante/Alacant", "Santa Cruz de
// Tenerife"; el Catastro responde "LA PROVINCIA NO EXISTE" a las tres. Su
// lista (ConsultaProvincia, 26 de octubre de 2026) va en mayusculas, sin
// acentos y con nombres propios: ALACANT, CASTELLO, S.C. TENERIFE, A CORUÑA.
// Admite "ALICANTE" y "CASTELLON" como alias, pero no "SANTA CRUZ DE
// TENERIFE". Los municipios, igual: "MOJACAR" y "VILANOVA I LA GELTRU"
// existen; "MOJÁCAR" y "Vilanova i la Geltrú" no.
// ---------------------------------------------------------------------------

const PROVINCIAS_CATASTRO: Record<string, string> = {
  "SANTA CRUZ DE TENERIFE": "S.C. TENERIFE",
  "TENERIFE": "S.C. TENERIFE",
  "ALICANTE": "ALACANT",
  "CASTELLON": "CASTELLO",
  "LA CORUÑA": "A CORUÑA",
  "CORUÑA": "A CORUÑA",
  "GERONA": "GIRONA",
  "LERIDA": "LLEIDA",
  "ORENSE": "OURENSE",
  "ISLAS BALEARES": "ILLES BALEARS",
  "BALEARES": "ILLES BALEARS",
};

function mayusculasSinAcentos(v: string): string {
  let n = sinAcentos(v).toUpperCase().replace(/\s+/g, " ").trim();
  // "CORUÑA, A" -> "A CORUÑA"; "PALMAS, LAS" -> "LAS PALMAS".
  const pospuesto = /^(.+),\s*(A|LA|LAS|EL|LOS|LES|ILLES)$/.exec(n);
  if (pospuesto) n = `${pospuesto[2]} ${pospuesto[1]}`;
  return n;
}

/**
 * Provincia y municipio en la forma que acepta el Catastro. De un nombre
 * bilingüe ("Alicante/Alacant") se queda con la primera mitad y la traduce
 * si hace falta. El municipio solo se pone en mayusculas sin acentos: los
 * municipios bilingües ("MONOVAR/MONOVER") siguen sin resolverse, porque el
 * Catastro quiere su nombre doble completo y eso exige preguntarle.
 */
export function lugarCatastral(provincia: string, municipio: string): { provincia: string; municipio: string } {
  const p = mayusculasSinAcentos(provincia.split("/")[0] ?? provincia);
  return {
    provincia: PROVINCIAS_CATASTRO[p] ?? p,
    municipio: mayusculasSinAcentos(municipio),
  };
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
