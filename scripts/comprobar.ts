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

  // El enriquecimiento, por fuente real: es lo que decide si el mapa pinta
  // algo y si la calculadora tiene valoracion. "pendientes" son los bienes que
  // la vista v_bien_por_enriquecer aun considera mejorables; "en cola", los
  // trabajos enriquecer que esperan turno.
  const precisiones = await consultar<{ precision: string; n: number; superficie: number; valorados: number }>(
    `select coalesce(e.precision_geo::text, 'sin enriquecer') as precision, count(*)::bigint as n,
            count(e.m2_construidos)::bigint as superficie, count(e.valor_estimado)::bigint as valorados
     from bien b join lote l on l.id = b.lote_id join subasta s on s.id = l.subasta_id
     left join bien_enriquecido e on e.bien_id = b.id
     where s.fuente <> 'muestra'
     group by 1 order by 2 desc`,
  );
  if (precisiones.length > 0) {
    console.info("Enriquecimiento de los bienes reales (precision de las coordenadas):");
    for (const p of precisiones) {
      console.info(`  ${p.precision.padEnd(15)} ${String(p.n).padStart(6)} bienes` +
        `  ${String(p.superficie).padStart(5)} con superficie  ${String(p.valorados).padStart(5)} valorados`);
    }
    const [cola] = await consultar<{ pendientes: number; en_cola: number }>(
      `select (select count(*) from v_bien_por_enriquecer v
                 join lote l on l.id = v.lote_id join subasta s on s.id = l.subasta_id
                 where s.fuente <> 'muestra')::bigint as pendientes,
              (select count(*) from trabajo where tipo = 'enriquecer' and estado in ('pendiente', 'ejecutando'))::bigint as en_cola`,
    );
    console.info(`  ${cola?.pendientes ?? 0} bienes aun mejorables segun la vista, ${cola?.en_cola ?? 0} en cola de enriquecer.`);
  }

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
