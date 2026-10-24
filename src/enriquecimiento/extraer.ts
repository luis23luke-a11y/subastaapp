// ---------------------------------------------------------------------------
// Extraccion de cargas y situacion posesoria desde el texto libre del anuncio.
//
// Capa de reglas deterministas. Es la primera y la que decide en la mayoria de
// los casos: es auditable, no cuesta dinero y, sobre todo, puede explicar por
// que dijo lo que dijo. Lo que queda dudoso pasa al revisor con modelo de
// lenguaje (revisor.ts), no al reves.
//
// LA TRAMPA PRINCIPAL. La Ley de Enjuiciamiento Civil obliga a incluir en todo
// anuncio la formula de que "las cargas y gravamenes anteriores y los
// preferentes, si los hubiere, al credito del actor continuaran subsistentes".
// Esa frase aparece en practicamente TODOS los anuncios, haya cargas o no.
// Tomarla como prueba de que hay cargas marcaria el catalogo entero como
// peligroso y haria el filtro inutil. Aqui se reconoce como formula de estilo
// y no cuenta como senal.
//
// La otra distincion que importa: las cargas ANTERIORES subsisten tras la
// adjudicacion; las POSTERIORES se cancelan. Solo las primeras son un coste.
// ---------------------------------------------------------------------------

import { importesEnTexto } from "@/enriquecimiento/importe";
import type { Situacion } from "@/lib/tipos";

export interface Veredicto<T> {
  valor: T;
  confianza: number;
  /** La frase literal del anuncio que lo justifica. Se muestra al usuario. */
  evidencia: string | null;
  /** Que regla lo decidio, para poder depurar un fallo concreto. */
  regla: string;
}

export interface Extraccion {
  cargasSubsisten: Veredicto<boolean | null>;
  cargasImporte: Veredicto<number | null>;
  situacion: Veredicto<Situacion>;
  viviendaHabitual: Veredicto<boolean | null>;
  confianzaGlobal: number;
  necesitaRevision: boolean;
  /** Formulas de estilo detectadas, que no cuentan como prueba de nada. */
  formulasDeEstilo: string[];
}

/** Umbral por debajo del cual conviene que mire el modelo de lenguaje. */
export const UMBRAL_REVISION = 0.6;

const SIN_EVIDENCIA = <T,>(valor: T, regla: string): Veredicto<T> =>
  ({ valor, confianza: 0, evidencia: null, regla });

/**
 * Quita acentos y pasa a minusculas SIN cambiar la longitud, para que las
 * posiciones de los aciertos sigan valiendo sobre el texto original y la
 * evidencia que se ensena al usuario sea literal.
 */
const ACENTOS: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n",
  Á: "a", É: "e", Í: "i", Ó: "o", Ú: "u", Ü: "u", Ñ: "n",
};

export function normalizarConservandoPosiciones(texto: string): string {
  let salida = "";
  for (const c of texto) salida += ACENTOS[c] ?? c.toLowerCase();
  return salida;
}

interface Senal {
  nombre: string;
  patron: RegExp;
  confianza: number;
}

// --- Formulas de estilo ----------------------------------------------------

const FORMULAS: Senal[] = [
  { nombre: "formula-lec-subsistentes",
    patron: /(?:cargas|gravamenes)[^.]{0,120}?si\s+los\s+hubiere[^.]{0,120}?(?:continuaran|quedaran)\s+subsistentes/,
    confianza: 0 },
  { nombre: "formula-lec-subsistentes-inversa",
    patron: /(?:continuaran|quedaran)\s+subsistentes[^.]{0,160}?si\s+los\s+hubiere/,
    confianza: 0 },
  { nombre: "formula-aceptacion",
    patron: /(?:el\s+)?(?:licitador|rematante|adjudicatario)[^.]{0,80}?acepta[^.]{0,80}?subsistencia/,
    confianza: 0 },
];

// --- Cargas ----------------------------------------------------------------

const CARGAS_NO: Senal[] = [
  { nombre: "no-constan-cargas", patron: /no\s+const(?:a|an)\s+(?:la\s+existencia\s+de\s+)?(?:otras\s+)?cargas/, confianza: 0.9 },
  { nombre: "no-constan-anteriores", patron: /no\s+const(?:a|an)\s+cargas?\s+(?:ni\s+gravamenes\s+)?anteriores/, confianza: 0.92 },
  { nombre: "libre-de-cargas", patron: /libre\s+de\s+cargas(?:\s+y\s+gravamenes)?/, confianza: 0.9 },
  { nombre: "sin-cargas", patron: /sin\s+cargas\s+(?:ni\s+gravamenes|anteriores)/, confianza: 0.85 },
  { nombre: "no-existen-cargas", patron: /no\s+(?:existen|hay)\s+cargas/, confianza: 0.88 },
  { nombre: "certificacion-negativa", patron: /(?:segun|conforme\s+a)\s+(?:la\s+)?certificacion[^.]{0,80}?no\s+const(?:a|an)[^.]{0,60}?(?:cargas|anteriores)/, confianza: 0.9 },
  // "No consta la situacion posesoria NI la existencia de cargas": la negacion
  // se reparte entre las dos cosas. El guardia del "si" evita confundirlo con
  // "no consta SI existen cargas", que significa que no se sabe.
  { nombre: "no-constan-ni-cargas",
    patron: /no\s+const(?:a|an)\b(?![^.]{0,25}\bsi\b)[^.]{0,80}?\bni\s+(?:la\s+existencia\s+de\s+)?(?:otras\s+)?cargas/,
    confianza: 0.85 },
];

const CARGAS_SI: Senal[] = [
  { nombre: "subsisten-con-importe", patron: /(?:cargas?|gravamen(?:es)?|embargos?|hipotecas?)\s+anterior(?:es)?[^.]{0,120}?por\s+(?:un\s+)?importe\s+(?:aproximado\s+)?de/, confianza: 0.95 },
  { nombre: "embargo-anterior", patron: /const(?:a|an)\s+(?:un\s+)?embargos?\s+anterior(?:es)?/, confianza: 0.9 },
  { nombre: "hipoteca-anterior", patron: /const(?:a|an)\s+(?:una\s+)?hipotecas?\s+anterior(?:es)?/, confianza: 0.9 },
  { nombre: "se-subroga", patron: /(?:el\s+)?adjudicatario\s+se\s+subroga\s+en\s+(?:la|las|el|los)\s+(?:carga|gravamen|hipoteca|embargo)/, confianza: 0.88 },
  { nombre: "subsisten-afirmativo", patron: /subsisten\s+las\s+cargas\s+anteriores(?![^.]{0,60}si\s+los\s+hubiere)/, confianza: 0.8 },
  { nombre: "no-se-cancelaran", patron: /no\s+se\s+cancelaran\s+con\s+la\s+adjudicacion/, confianza: 0.82 },
];

// --- Situacion posesoria ---------------------------------------------------

const OCUPADO: Senal[] = [
  { nombre: "ocupado-por-ejecutado", patron: /ocupad[ao]\s+por\s+(?:el|la|los|las)\s+(?:ejecutad|demandad|deudor|titular)/, confianza: 0.93 },
  { nombre: "se-encuentra-ocupado", patron: /se\s+encuentra\s+ocupad[ao]/, confianza: 0.9 },
  { nombre: "posesion-no-se-entrega", patron: /(?:la\s+)?posesion\s+no\s+se\s+(?:entrega|transmite)/, confianza: 0.85 },
  { nombre: "arrendado", patron: /(?:se\s+encuentra\s+)?arrendad[ao]\b/, confianza: 0.8 },
  { nombre: "ocupantes-desconocidos", patron: /ocupantes?\s+(?:desconocidos|ignorados)/, confianza: 0.8 },
  { nombre: "ocupado-simple", patron: /\bocupad[ao]\b/, confianza: 0.6 },
];

const LIBRE: Senal[] = [
  { nombre: "libre-de-ocupantes", patron: /libre\s+de\s+(?:ocupantes|arrendatarios|inquilinos)/, confianza: 0.93 },
  { nombre: "desocupado", patron: /se\s+encuentra\s+(?:desocupad[ao]|vacia?o?)/, confianza: 0.9 },
  { nombre: "sin-ocupantes", patron: /sin\s+ocupantes/, confianza: 0.88 },
  { nombre: "no-consta-ocupacion", patron: /no\s+consta\s+(?:que\s+)?(?:este|se\s+encuentre)\s+ocupad[ao]/, confianza: 0.7 },
];

const POSESION_DESCONOCIDA: Senal[] = [
  { nombre: "no-consta-situacion", patron: /no\s+consta\s+(?:en\s+autos\s+)?(?:la\s+)?situacion\s+posesoria/, confianza: 0.92 },
  { nombre: "se-desconoce", patron: /se\s+desconoce\s+(?:la\s+)?(?:situacion|estado)\s+(?:posesori|de\s+ocupacion)/, confianza: 0.9 },
  { nombre: "sin-determinar", patron: /situacion\s+posesoria[^.]{0,40}?(?:sin\s+determinar|no\s+determinada|se\s+ignora)/, confianza: 0.88 },
];

// --- Vivienda habitual -----------------------------------------------------

const HABITUAL_SI: Senal[] = [
  { nombre: "constituye-vivienda-habitual", patron: /(?:constituye|es)\s+(?:la\s+|el\s+)?(?:vivienda|domicilio)\s+habitual/, confianza: 0.93 },
  { nombre: "vivienda-habitual", patron: /(?:vivienda|domicilio)\s+habitual\s+(?:del?\s+)?(?:ejecutad|demandad|deudor)/, confianza: 0.92 },
];

const HABITUAL_NO: Senal[] = [
  { nombre: "no-es-habitual", patron: /no\s+(?:constituye|es)\s+(?:la\s+|el\s+)?(?:vivienda|domicilio)\s+habitual/, confianza: 0.92 },
];

// --- Motor -----------------------------------------------------------------

interface Acierto { senal: Senal; evidencia: string; inicio: number }

function buscar(texto: string, normal: string, senales: Senal[]): Acierto | null {
  let mejor: Acierto | null = null;
  for (const senal of senales) {
    const m = senal.patron.exec(normal);
    if (!m) continue;
    const acierto: Acierto = {
      senal,
      evidencia: recortarFrase(texto, m.index, m.index + m[0].length),
      inicio: m.index,
    };
    if (!mejor || senal.confianza > mejor.senal.confianza) mejor = acierto;
  }
  return mejor;
}

/**
 * Devuelve la frase entera que contiene el acierto, para que la evidencia se
 * lea sola y no como un fragmento descontextualizado.
 *
 * El punto solo termina frase si le sigue un espacio o el final del texto. Sin
 * esa condicion, "44.900 euros" se parte en "44." y la cita que se le ensena al
 * usuario queda mutilada justo en la cifra que mas le importa. Lo mismo pasa
 * con "n.º" y con las abreviaturas.
 */
function terminaFrase(texto: string, i: number): boolean {
  const c = texto[i];
  if (c === "\n" || c === ";") return true;
  if (c !== ".") return false;
  const siguiente = texto[i + 1];
  return siguiente === undefined || /\s/.test(siguiente);
}

function recortarFrase(texto: string, inicio: number, fin: number): string {
  let a = inicio;
  while (a > 0 && !terminaFrase(texto, a - 1)) a--;
  let b = fin;
  while (b < texto.length && !terminaFrase(texto, b)) b++;
  if (b < texto.length) b++;
  return texto.slice(a, b).trim();
}

export function extraerDeTexto(texto: string | null | undefined): Extraccion {
  const vacio: Extraccion = {
    cargasSubsisten: SIN_EVIDENCIA<boolean | null>(null, "sin-texto"),
    cargasImporte: SIN_EVIDENCIA<number | null>(null, "sin-texto"),
    situacion: SIN_EVIDENCIA<Situacion>("desconocido", "sin-texto"),
    viviendaHabitual: SIN_EVIDENCIA<boolean | null>(null, "sin-texto"),
    confianzaGlobal: 0,
    necesitaRevision: true,
    formulasDeEstilo: [],
  };
  if (!texto || !texto.trim()) return vacio;

  const normal = normalizarConservandoPosiciones(texto);

  const formulas = FORMULAS.filter((f) => f.patron.test(normal)).map((f) => f.nombre);

  // Cargas: la negacion explicita gana a la afirmacion generica, porque una
  // certificacion registral negativa es un hecho y "subsisten las cargas" sin
  // mas suele ser formula.
  const noCargas = buscar(texto, normal, CARGAS_NO);
  const siCargas = buscar(texto, normal, CARGAS_SI);

  let cargas: Veredicto<boolean | null>;
  if (siCargas && (!noCargas || siCargas.senal.confianza > noCargas.senal.confianza)) {
    cargas = { valor: true, confianza: siCargas.senal.confianza,
               evidencia: siCargas.evidencia, regla: siCargas.senal.nombre };
  } else if (noCargas) {
    cargas = { valor: false, confianza: noCargas.senal.confianza,
               evidencia: noCargas.evidencia, regla: noCargas.senal.nombre };
  } else if (formulas.length > 0) {
    // Solo hay formula de estilo: no se sabe nada, y hay que decirlo.
    cargas = { valor: null, confianza: 0.2, evidencia: null,
               regla: "solo-formula-de-estilo" };
  } else {
    cargas = SIN_EVIDENCIA<boolean | null>(null, "sin-senales");
  }

  // Importe: solo tiene sentido buscarlo si hay cargas, y solo cuenta el que
  // esta cerca de la frase que las menciona.
  let importe: Veredicto<number | null> = SIN_EVIDENCIA<number | null>(null, "sin-cargas");
  if (cargas.valor === true && siCargas) {
    const candidatos = importesEnTexto(texto)
      .filter((i) => Math.abs(i.inicio - siCargas.inicio) < 320);
    const elegido = candidatos[0];
    if (elegido) {
      importe = { valor: elegido.valor, confianza: Math.min(0.85, siCargas.senal.confianza),
                  evidencia: recortarFrase(texto, elegido.inicio, elegido.fin),
                  regla: "importe-junto-a-la-carga" };
    } else {
      importe = { valor: null, confianza: 0.3, evidencia: null, regla: "cargas-sin-importe" };
    }
  }

  // Situacion posesoria.
  const ocupado = buscar(texto, normal, OCUPADO);
  const libre = buscar(texto, normal, LIBRE);
  const desconocida = buscar(texto, normal, POSESION_DESCONOCIDA);

  const candidatosPosesion: Array<[Situacion, Acierto | null]> = [
    ["ocupado", ocupado], ["libre", libre], ["desconocido", desconocida],
  ];
  const ganador = candidatosPosesion
    .filter((c): c is [Situacion, Acierto] => c[1] !== null)
    .sort((a, b) => b[1].senal.confianza - a[1].senal.confianza)[0];

  const situacion: Veredicto<Situacion> = ganador
    ? { valor: ganador[0], confianza: ganador[1].senal.confianza,
        evidencia: ganador[1].evidencia, regla: ganador[1].senal.nombre }
    : SIN_EVIDENCIA<Situacion>("desconocido", "sin-senales");

  // Vivienda habitual: la negacion gana siempre, es mas especifica.
  const habitualNo = buscar(texto, normal, HABITUAL_NO);
  const habitualSi = buscar(texto, normal, HABITUAL_SI);
  const habitual: Veredicto<boolean | null> = habitualNo
    ? { valor: false, confianza: habitualNo.senal.confianza,
        evidencia: habitualNo.evidencia, regla: habitualNo.senal.nombre }
    : habitualSi
      ? { valor: true, confianza: habitualSi.senal.confianza,
          evidencia: habitualSi.evidencia, regla: habitualSi.senal.nombre }
      : SIN_EVIDENCIA<boolean | null>(null, "sin-senales");

  // La confianza global es la del campo peor resuelto de los dos que deciden
  // una puja: cargas y posesion. Promediarlos escondería el que falla.
  const confianzaGlobal = Math.min(cargas.confianza, situacion.confianza);

  return {
    cargasSubsisten: cargas,
    cargasImporte: importe,
    situacion,
    viviendaHabitual: habitual,
    confianzaGlobal,
    necesitaRevision: confianzaGlobal < UMBRAL_REVISION,
    formulasDeEstilo: formulas,
  };
}
