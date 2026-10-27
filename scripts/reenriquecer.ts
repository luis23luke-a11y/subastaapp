// Vuelve a enriquecer bienes reales ya enriquecidos, con el codigo actual.
// npm run db:reenriquecer -- --precision ninguna [--limite 200]
//
// bien_enriquecido es la tabla de datos calculados y se puede regenerar
// (CLAUDE.md); el dato de origen no se toca. Sirve para medir que cambia un
// arreglo de la cadena de geocodificacion sobre los bienes que ya fallaron,
// sin esperar a que la cola los vuelva a coger (cada pasada enriquece unos
// cuarenta). Con --precision ninguna coge los sin localizar; con
// --sin-enriquecer, los que no tienen fila todavia. Va al ritmo del Catastro
// y de CartoCiudad, asi que mil bienes son unos veinte minutos.

import { consultar, pool } from "@/lib/db";
import { enriquecerBien } from "@/enriquecimiento/enriquecer";

async function principal() {
  const args = process.argv.slice(2);
  const valor = (nombre: string) => (args.includes(nombre) ? args[args.indexOf(nombre) + 1] : undefined);
  const precision = valor("--precision") ?? (args.includes("--sin-enriquecer") ? null : "ninguna");
  const limite = Number.parseInt(valor("--limite") ?? "100000", 10);

  const bienes = await consultar<{ id: number }>(
    `select b.id
     from bien b join lote l on l.id = b.lote_id join subasta s on s.id = l.subasta_id
     left join bien_enriquecido e on e.bien_id = b.id
     where s.fuente <> 'muestra'
       and (($1::text is null and e.bien_id is null) or ($1::text is not null and e.precision_geo::text = $1::text))
     order by b.id
     limit $2`,
    [precision, limite],
  );
  console.info(`${bienes.length} bienes por volver a enriquecer (${precision ?? "sin enriquecer"}).`);

  const resumen = new Map<string, number>();
  let hechos = 0;
  let fallos = 0;
  const inicio = Date.now();
  for (const { id } of bienes) {
    try {
      const r = await enriquecerBien(id);
      const p = r?.precision ?? "sin bien";
      resumen.set(p, (resumen.get(p) ?? 0) + 1);
      hechos++;
      if (r && r.precision !== "ninguna") console.info(`  ${id} ${r.precision.padEnd(10)} ${r.comoSeObtuvo}`);
    } catch (err) {
      fallos++;
      console.error(`  ${id} ERROR ${err instanceof Error ? err.message : String(err)}`);
    }
    if ((hechos + fallos) % 50 === 0) {
      console.info(`  ... ${hechos + fallos}/${bienes.length} en ${Math.round((Date.now() - inicio) / 1000)} s`);
    }
  }
  console.info(`\n${hechos} enriquecidos, ${fallos} fallos, ${Math.round((Date.now() - inicio) / 1000)} s.`);
  for (const [p, n] of [...resumen.entries()].sort((a, b) => b[1] - a[1])) console.info(`  ${p.padEnd(12)} ${n}`);
  await pool.end();
}

principal().catch((e) => { console.error(e); process.exit(1); });
