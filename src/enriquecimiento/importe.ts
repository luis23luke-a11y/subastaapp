// Importes escritos a mano en los anuncios: "1.234.567,89 euros", "12000 €",
// "DOCE MIL EUROS". Funcion pura, con pruebas.

const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, treinta: 30,
  cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80,
  noventa: 90, cien: 100, ciento: 100, doscientos: 200, trescientos: 300,
  cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700,
  ochocientos: 800, novecientos: 900,
};

/**
 * Convierte un numero escrito en espanol: "ciento veinte mil" -> 120000.
 * Solo cubre hasta millones, que es de sobra para un anuncio de subasta.
 */
export function numeroEnLetras(texto: string): number | null {
  const palabras = texto.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/\s+|-/).filter((p) => p && p !== "y");
  if (palabras.length === 0) return null;

  let total = 0;
  let parcial = 0;
  let algo = false;

  for (const p of palabras) {
    if (p === "mil") {
      total += (parcial === 0 ? 1 : parcial) * 1000;
      parcial = 0;
      algo = true;
    } else if (p === "millon" || p === "millones") {
      total = (total + (parcial === 0 ? 1 : parcial)) * 1_000_000;
      parcial = 0;
      algo = true;
    } else if (p in UNIDADES) {
      parcial += UNIDADES[p]!;
      algo = true;
    } else {
      return null;
    }
  }
  return algo ? total + parcial : null;
}

/**
 * Importe en cifras con formato espanol. Devuelve null si el texto es
 * ambiguo: mejor ningun numero que uno mal leido, porque de aqui sale el
 * coste que el usuario resta del margen.
 */
export function importeEnCifras(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(limpio)) return null;

  const tienePunto = limpio.includes(".");
  const tieneComa = limpio.includes(",");

  if (tienePunto && tieneComa) {
    // Formato espanol completo: 1.234.567,89
    if (limpio.lastIndexOf(",") < limpio.lastIndexOf(".")) return null;
    const n = Number.parseFloat(limpio.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  if (tieneComa) {
    const partes = limpio.split(",");
    if (partes.length !== 2) return null;
    // "1,5" en un importe es un decimal; "1,500" es ambiguo y se descarta.
    if (partes[1]!.length === 3) return null;
    const n = Number.parseFloat(limpio.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  if (tienePunto) {
    const partes = limpio.split(".");
    // Separador de miles bien formado: 1.234.567
    const esMiles = partes.length > 1 && partes.slice(1).every((p) => p.length === 3);
    if (esMiles) return Number.parseInt(partes.join(""), 10);
    // 1.5 no es un importe espanol: ambiguo, se descarta.
    return null;
  }

  const n = Number.parseInt(limpio, 10);
  return Number.isFinite(n) ? n : null;
}

const CON_MONEDA =
  /(\d[\d.,]*)\s*(?:euros?|€|eur\b)|(?:euros?|€)\s*(\d[\d.,]*)/gi;

const LETRAS_CON_MONEDA =
  /\b((?:(?:un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintidos|veintitres|veinticuatro|veinticinco|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos|mil|millon|millones|y)\s*)+)\s*euros?\b/gi;

export interface ImporteHallado {
  valor: number;
  inicio: number;
  fin: number;
  texto: string;
}

/** Todos los importes con moneda que aparecen en un texto, con su posicion. */
export function importesEnTexto(texto: string): ImporteHallado[] {
  const hallados: ImporteHallado[] = [];

  for (const m of texto.matchAll(CON_MONEDA)) {
    const crudo = m[1] ?? m[2];
    if (!crudo) continue;
    const valor = importeEnCifras(crudo);
    if (valor == null) continue;
    hallados.push({ valor, inicio: m.index, fin: m.index + m[0].length, texto: m[0].trim() });
  }

  for (const m of texto.matchAll(LETRAS_CON_MONEDA)) {
    const valor = numeroEnLetras(m[1]!);
    if (valor == null || valor === 0) continue;
    if (hallados.some((h) => m.index < h.fin && m.index + m[0].length > h.inicio)) continue;
    hallados.push({ valor, inicio: m.index, fin: m.index + m[0].length, texto: m[0].trim() });
  }

  return hallados.sort((a, b) => a.inicio - b.inicio);
}
