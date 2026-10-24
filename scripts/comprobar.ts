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

  // Por fuente, porque es lo que decide que ve el usuario: la vista de busqueda
  // esconde la fuente "muestra" en cuanto hay una subasta de cualquier otra.
  const fuentes = await consultar<{ fuente: string; subastas: number; lotes: number; ultima: string | null }>(
    `select s.fuente, count(distinct s.id)::bigint as subastas, count(l.id)::bigint as lotes,
            to_char(max(s.fecha_publicacion), 'YYYY-MM-DD') as ultima
     from subasta s left join lote l on l.subasta_id = s.id
     group by s.fuente order by s.fuente`,
  );
  console.info("Por fuente:");
  if (fuentes.length === 0) console.info("  (ninguna)");
  for (const f of fuentes) {
    console.info(`  ${f.fuente.padEnd(10)} ${String(f.subastas).padStart(6)} subastas ${String(f.lotes).padStart(6)} lotes` +
      (f.ultima ? `  ultima publicacion ${f.ultima}` : ""));
  }
  const [vista] = await consultar<{ n: number; muestra: number }>(
    `select count(*)::bigint as n, count(*) filter (where fuente = 'muestra')::bigint as muestra
     from v_lote_busqueda`,
  );
  console.info(
    `El buscador ve ${vista?.n ?? 0} lotes` +
    (vista && vista.muestra > 0 ? `, todos de muestra (no hay ninguna subasta real todavia).` : `, ninguno de muestra.`),
  );

  const ejecuciones = await consultar<{ fuente: string; inicio: string; fin: string | null; procesadas: number; nuevas: number; fallidas: number; error: string | null }>(
    `select fuente, to_char(inicio, 'YYYY-MM-DD HH24:MI') as inicio, to_char(fin, 'HH24:MI') as fin,
            procesadas, nuevas, fallidas, error
     from ejecucion order by inicio desc limit 5`,
  );
  if (ejecuciones.length > 0) {
    console.info("Ultimas pasadas del worker:");
    for (const e of ejecuciones) {
      console.info(
        `  ${e.inicio} -> ${e.fin ?? "(en curso)"}  ${e.fuente.padEnd(8)} ` +
        `${e.procesadas} procesadas, ${e.nuevas} nuevas, ${e.fallidas} fallos` +
        (e.error ? `  ERROR: ${e.error.slice(0, 80)}` : ""),
      );
    }
  }
  await pool.end();
}
principal().catch((e) => { console.error(e); process.exit(1); });
