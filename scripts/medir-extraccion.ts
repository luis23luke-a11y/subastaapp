// Mide el extractor de cargas y situacion posesoria sobre los anuncios reales
// que ya estan en la base, sin escribir nada. Dice que parte de los lotes
// resuelve cada campo y, para lo que no resuelve, cuales son las frases mas
// repetidas: esas son las reglas que faltan.
//
//   npm run medir:extraccion                    resumen y las 25 frases mas frecuentes
//   npm run medir:extraccion -- --frases=60     mas frases
//   npm run medir:extraccion -- --campo=situacion   solo ese campo (cargas | situacion | habitual)

import { extraerDeTexto } from "@/enriquecimiento/extraer";
import { consultar, pool } from "@/lib/db";

function argumento(nombre: string, porDefecto?: string): string | undefined {
  const pref = `--${nombre}=`;
  return process.argv.find((a) => a.startsWith(pref))?.slice(pref.length) ?? porDefecto;
}

/** Linea "Etiqueta: valor" del texto compuesto por el adaptador. */
function linea(texto: string, etiqueta: string): string | null {
  const m = new RegExp(`^${etiqueta}:\\s*(.*)$`, "m").exec(texto);
  return m?.[1]?.trim() || null;
}

/** Agrupa frases parecidas: sin cifras, sin fechas, en minusculas y recortadas. */
function plantilla(frase: string): string {
  return frase
    .toLowerCase()
    .replace(/\d[\d.,/-]*/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function top(cuentas: Map<string, { n: number; ejemplo: string }>, cuantos: number): string {
  return [...cuentas.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, cuantos)
    .map(([, v]) => `  ${String(v.n).padStart(4)}  ${v.ejemplo.slice(0, 150)}`)
    .join("\n");
}

async function principal() {
  const cuantas = Number.parseInt(argumento("frases", "25")!, 10);
  const campo = argumento("campo");

  const lotes = await consultar<{ id: number; texto: string }>(
    `select l.id, l.cargas_texto as texto
     from lote l join subasta s on s.id = l.subasta_id
     where s.fuente = 'boe' and l.cargas_texto is not null`,
  );

  const r = {
    total: lotes.length,
    cargas: { si: 0, no: 0, soloFormula: 0, sinSenales: 0 },
    situacion: { ocupado: 0, libre: 0, desconocido: 0 },
    habitual: { si: 0, no: 0, nulo: 0 },
  };
  const sinCargas = new Map<string, { n: number; ejemplo: string }>();
  const sinSituacion = new Map<string, { n: number; ejemplo: string }>();
  const sinHabitual = new Map<string, { n: number; ejemplo: string }>();
  const cuenta = (mapa: Map<string, { n: number; ejemplo: string }>, frase: string | null) => {
    if (!frase) return;
    const k = plantilla(frase);
    const v = mapa.get(k);
    if (v) v.n++; else mapa.set(k, { n: 1, ejemplo: frase });
  };

  for (const l of lotes) {
    const e = extraerDeTexto(l.texto);
    if (e.cargasSubsisten.valor === true) r.cargas.si++;
    else if (e.cargasSubsisten.valor === false) r.cargas.no++;
    else if (e.cargasSubsisten.regla === "solo-formula-de-estilo") r.cargas.soloFormula++;
    else r.cargas.sinSenales++;
    if (e.cargasSubsisten.valor == null) cuenta(sinCargas, linea(l.texto, "Cargas"));

    r.situacion[e.situacion.valor]++;
    if (e.situacion.valor === "desconocido") cuenta(sinSituacion, linea(l.texto, "Situación posesoria"));

    if (e.viviendaHabitual.valor === true) r.habitual.si++;
    else if (e.viviendaHabitual.valor === false) r.habitual.no++;
    else { r.habitual.nulo++; cuenta(sinHabitual, linea(l.texto, "Vivienda habitual")); }
  }

  const pct = (n: number) => `${((100 * n) / Math.max(1, r.total)).toFixed(1)} %`;
  console.info(`${r.total} lotes reales con texto\n`);
  console.info(`Cargas:     subsisten ${r.cargas.si} (${pct(r.cargas.si)}) · no subsisten ${r.cargas.no} (${pct(r.cargas.no)}) · solo fórmula ${r.cargas.soloFormula} · sin señales ${r.cargas.sinSenales}`);
  console.info(`Situación:  ocupado ${r.situacion.ocupado} (${pct(r.situacion.ocupado)}) · libre ${r.situacion.libre} (${pct(r.situacion.libre)}) · desconocido ${r.situacion.desconocido}`);
  console.info(`Habitual:   sí ${r.habitual.si} · no ${r.habitual.no} · sin dato ${r.habitual.nulo}`);

  if (!campo || campo === "cargas") {
    console.info(`\nFrases de "Cargas" sin resolver (${sinCargas.size} distintas):`);
    console.info(top(sinCargas, cuantas));
  }
  if (!campo || campo === "situacion") {
    console.info(`\nFrases de "Situación posesoria" sin resolver (${sinSituacion.size} distintas):`);
    console.info(top(sinSituacion, cuantas));
  }
  if (!campo || campo === "habitual") {
    console.info(`\nFrases de "Vivienda habitual" sin resolver (${sinHabitual.size} distintas):`);
    console.info(top(sinHabitual, Math.min(cuantas, 10)));
  }
  await pool.end();
}

principal().catch((err) => { console.error(err); process.exit(1); });
