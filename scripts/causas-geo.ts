// Por que un bien real se queda sin localizar (precision "ninguna"), contado
// sobre la base, para la tabla del README. npm run db:causas
//
// Clasifica cada bien en una sola causa, por orden: lo que no tiene arreglo
// aqui (catastro foral, sin direccion ni referencia), la referencia que trae,
// la direccion y lo que respondio el Catastro a ella segun catastro_cache.
// Con --json <ruta> guarda ademas la causa de cada bien, para cruzarla con
// la precision que tenga despues de volver a enriquecerlos. Con --precision
// se cuenta otro grupo (por ejemplo "municipio").
//
// No le pregunta nada al Catastro: solo lee lo que ya hay en la cache, asi
// que "sin consultar" quiere decir que a ese bien aun no se le ha intentado
// por direccion con el codigo actual.

import { writeFileSync } from "node:fs";
import { consultar, pool } from "@/lib/db";
import { limpiarReferenciaCatastral, lugarCatastral, partirDireccion } from "@/enriquecimiento/direccion";

const FORALES = new Set(["País Vasco", "Navarra"]);

interface Bien {
  id: number; ref: string | null; direccion: string | null; municipio: string | null;
  provincia: string | null; comunidad: string | null; precision: string;
}

async function principal() {
  const args = process.argv.slice(2);
  const valor = (nombre: string) => (args.includes(nombre) ? args[args.indexOf(nombre) + 1] : undefined);
  const rutaJson = valor("--json") ?? null;
  const precision = valor("--precision") ?? "ninguna";

  const bienes = await consultar<Bien>(
    `select b.id, b.referencia_catastral as ref, b.direccion, b.municipio, b.provincia, b.comunidad,
            coalesce(e.precision_geo::text, 'sin enriquecer') as precision
     from bien b join lote l on l.id = b.lote_id join subasta s on s.id = l.subasta_id
     left join bien_enriquecido e on e.bien_id = b.id
     where s.fuente <> 'muestra' and coalesce(e.precision_geo::text, 'sin enriquecer') = $1
     order by b.id`,
    [precision],
  );

  // Lo que el Catastro respondio a cada referencia y a cada direccion.
  const refs = new Map<number, string>();
  for (const b of bienes) {
    const limpia = limpiarReferenciaCatastral(b.ref);
    if (limpia) refs.set(b.id, limpia);
  }
  const cacheRef = new Map((await consultar<{ clave: string; error_cod: string | null; error_desc: string | null }>(
    `select clave, error_cod, error_desc from catastro_cache where operacion = 'Consulta_CPMRC' and clave = any($1::text[])`,
    [[...new Set([...refs.values()].map((r) => r.slice(0, 14)))]],
  )).map((c) => [c.clave, c]));

  const clavesDir = new Map<number, string>();
  const partidas = new Map<number, ReturnType<typeof partirDireccion>>();
  for (const b of bienes) {
    const p = partirDireccion(b.direccion);
    partidas.set(b.id, p);
    if (p?.numero && b.municipio && b.provincia) {
      const lugar = lugarCatastral(b.provincia, b.municipio);
      clavesDir.set(b.id, [lugar.provincia, lugar.municipio, p.sigla, p.nombre, p.numero].map((v) => v.toUpperCase()).join("|"));
    }
  }
  const cacheDir = new Map((await consultar<{ clave: string; error_cod: string | null; error_desc: string | null }>(
    `select clave, error_cod, error_desc from catastro_cache where operacion = 'Consulta_DNPLOC' and clave = any($1::text[])`,
    [[...new Set(clavesDir.values())]],
  )).map((c) => [c.clave, c]));

  const causaDe = (b: Bien): string => {
    if (b.comunidad && FORALES.has(b.comunidad)) return "Catastro foral (País Vasco o Navarra)";
    const ref = refs.get(b.id);
    const partida = partidas.get(b.id) ?? null;
    if (ref) {
      const c = cacheRef.get(ref.slice(0, 14));
      if (!c) return "Referencia bien formada aún sin consultar";
      if (c.error_cod) return `Referencia bien formada que el Catastro no conoce («${c.error_desc?.toLowerCase() ?? c.error_cod}»)`;
      return "Referencia que el Catastro resolvió (fallo nuestro)";
    }
    const traeRef = Boolean(b.ref && b.ref.trim());
    if (!partida) {
      if (!(b.direccion ?? "").trim()) return traeRef ? "Referencia mal copiada y sin dirección" : "Sin dirección ni referencia";
      return traeRef ? "Referencia mal copiada y dirección que no es una calle" : "Dirección que no es una calle (parcela, manzana, paraje)";
    }
    if (!partida.numero) return traeRef ? "Referencia mal copiada y dirección sin número" : "Dirección sin número de portal";
    const clave = clavesDir.get(b.id);
    const c = clave ? cacheDir.get(clave) : undefined;
    if (!c) return "Dirección con número aún sin consultar al Catastro";
    if (!c.error_cod) return "Dirección con número que el Catastro resolvió (fallo nuestro)";
    return `Dirección con número: «${(c.error_desc ?? c.error_cod).toLowerCase().replace(/\.$/, "")}»`;
  };

  const cuenta = new Map<string, { n: number; ejemplos: string[] }>();
  const porBien: Array<{ id: number; causa: string }> = [];
  for (const b of bienes) {
    const causa = causaDe(b);
    porBien.push({ id: b.id, causa });
    const fila = cuenta.get(causa) ?? { n: 0, ejemplos: [] };
    fila.n++;
    if (fila.ejemplos.length < 3) {
      fila.ejemplos.push(`${b.ref ? `[${b.ref}] ` : ""}${b.direccion ?? "(sin dirección)"} · ${b.municipio ?? "?"} (${b.provincia ?? "?"})`);
    }
    cuenta.set(causa, fila);
  }

  const ordenadas = [...cuenta.entries()].sort((a, b) => b[1].n - a[1].n);
  console.info(`${bienes.length} bienes reales con precisión «${precision}», por causa:\n`);
  console.info("| Causa | Bienes |\n|---|---|");
  for (const [causa, fila] of ordenadas) console.info(`| ${causa} | ${fila.n} |`);
  console.info("\nEjemplos literales:");
  for (const [causa, fila] of ordenadas) {
    console.info(`  ${causa}`);
    for (const e of fila.ejemplos) console.info(`    - ${e}`);
  }
  if (rutaJson) {
    writeFileSync(rutaJson, JSON.stringify(porBien, null, 1));
    console.info(`\nCausa de cada bien guardada en ${rutaJson}`);
  }
  await pool.end();
}

principal().catch((e) => { console.error(e); process.exit(1); });
