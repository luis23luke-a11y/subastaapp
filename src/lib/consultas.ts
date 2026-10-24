import { consultar, unaFila } from "@/lib/db";
import { construirConsulta, POR_PAGINA, type Filtro } from "@/lib/filtros";
import type { LoteBusqueda } from "@/lib/tipos";

const CAMPOS = `
  lote_id, subasta_id, fuente, id_externo, tipo, estado, procedimiento, autoridad, url,
  fecha_publicacion, fecha_fin, lote_numero, valor_subasta, valor_tasacion, puja_minima,
  deposito, cargas_importe, cargas_subsisten, cargas_texto, situacion, vivienda_habitual,
  confianza_extraccion, cargas_evidencia, situacion_evidencia, extraccion_regla,
  extraccion_origen, bien_id, bien_tipo, direccion, codigo_postal, municipio, provincia,
  comunidad, referencia_catastral, cuota_propiedad, lat, lon, precision_geo, m2_construidos,
  anio_construccion, precio_m2_zona, valor_estimado, confianza_valor, num_bienes,
  eur_m2_salida, margen_bruto`;

export interface ResultadoBusqueda {
  filas: LoteBusqueda[];
  total: number;
  pagina: number;
  paginas: number;
}

export async function buscarLotes(f: Filtro): Promise<ResultadoBusqueda> {
  const { where, orderBy, valores } = construirConsulta(f);
  const offset = (f.pagina - 1) * POR_PAGINA;

  const [filas, cuenta] = await Promise.all([
    consultar<LoteBusqueda>(
      `select ${CAMPOS} from v_lote_busqueda ${where}
       order by ${orderBy}, lote_id
       limit ${POR_PAGINA} offset ${offset}`,
      valores,
    ),
    unaFila<{ total: number }>(
      `select count(*)::bigint as total from v_lote_busqueda ${where}`,
      valores,
    ),
  ]);

  const total = cuenta?.total ?? 0;
  return { filas, total, pagina: f.pagina, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)) };
}

/** Puntos para el mapa: sin paginar, pero acotados para no reventar el cliente. */
export async function puntosLotes(f: Filtro, limite = 2000) {
  const { where, valores } = construirConsulta(f);
  const extra = where ? `${where} and geom is not null` : "where geom is not null";
  return consultar<{
    lote_id: number; lat: number; lon: number;
    valor_subasta: number | null; municipio: string | null;
    bien_tipo: string | null; precision_geo: string | null;
  }>(
    `select lote_id, lat, lon, valor_subasta, municipio, bien_tipo, precision_geo
     from v_lote_busqueda ${extra}
     order by fecha_fin asc nulls last
     limit ${limite}`,
    valores,
  );
}

export async function lotePorId(id: number): Promise<LoteBusqueda | null> {
  return unaFila<LoteBusqueda>(
    `select ${CAMPOS} from v_lote_busqueda where lote_id = $1`, [id],
  );
}

export async function bienesDelLote(loteId: number) {
  return consultar<{
    id: number; tipo: string; descripcion: string | null; direccion: string | null;
    municipio: string | null; provincia: string | null; referencia_catastral: string | null;
    cuota_propiedad: number; m2_construidos: number | null; anio_construccion: number | null;
    precision_geo: string | null;
  }>(
    `select b.id, b.tipo, b.descripcion, b.direccion, b.municipio, b.provincia,
            b.referencia_catastral, b.cuota_propiedad,
            e.m2_construidos, e.anio_construccion, e.precision_geo
     from bien b
     left join bien_enriquecido e on e.bien_id = b.id
     where b.lote_id = $1
     order by b.orden, b.id`,
    [loteId],
  );
}

export async function historicoLote(loteId: number) {
  return consultar<{ momento: string; estado: string | null; num_pujas: number | null; puja_actual: number | null }>(
    `select momento, estado, num_pujas, puja_actual
     from lote_snapshot where lote_id = $1 order by momento asc`,
    [loteId],
  );
}

export async function provincias() {
  return consultar<{ provincia: string; n: number }>(
    `select provincia, count(*)::bigint as n from v_lote_busqueda
     where provincia is not null group by provincia order by provincia`,
  );
}
