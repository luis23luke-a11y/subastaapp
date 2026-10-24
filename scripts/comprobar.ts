// Comprobacion rapida del estado de la base. npm run db:estado
import { consultar, pool } from "@/lib/db";

async function principal() {
  const [v] = await consultar<{ postgis: string }>(`select postgis_version() as postgis`);
  console.info(`PostGIS: ${v?.postgis ?? "no instalado"}`);
  const filas = await consultar<{ tabla: string; n: number }>(
    `select 'subasta' as tabla, count(*)::bigint as n from subasta
     union all select 'lote', count(*)::bigint from lote
     union all select 'bien', count(*)::bigint from bien
     union all select 'bien_enriquecido', count(*)::bigint from bien_enriquecido
     union all select 'lote_snapshot', count(*)::bigint from lote_snapshot
     union all select 'usuario', count(*)::bigint from usuario
     order by 1`,
  );
  for (const f of filas) console.info(`  ${f.tabla.padEnd(18)} ${f.n}`);
  await pool.end();
}
principal().catch((e) => { console.error(e); process.exit(1); });
