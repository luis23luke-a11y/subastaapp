// Tipos del dominio. Reflejan el esquema de db/001_esquema.sql.

export const TIPOS_SUBASTA = [
  "judicial", "aeat", "seguridad_social", "notarial", "concursal", "otra",
] as const;
export type TipoSubasta = (typeof TIPOS_SUBASTA)[number];

export const ESTADOS = [
  "publicada", "celebrandose", "puja_concluida", "finalizada",
  "cancelada", "suspendida", "desconocido",
] as const;
export type Estado = (typeof ESTADOS)[number];

export const TIPOS_BIEN = [
  "vivienda", "garaje", "trastero", "local", "nave", "oficina",
  "suelo", "rustica", "edificio", "otro",
] as const;
export type TipoBien = (typeof TIPOS_BIEN)[number];

export const SITUACIONES = ["ocupado", "libre", "desconocido"] as const;
export type Situacion = (typeof SITUACIONES)[number];

export const PRECISIONES = ["catastral", "portal", "via", "municipio", "ninguna"] as const;
export type PrecisionGeo = (typeof PRECISIONES)[number];

/** Una fila de v_lote_busqueda. */
export interface LoteBusqueda {
  lote_id: number;
  subasta_id: number;
  fuente: string;
  id_externo: string;
  tipo: TipoSubasta;
  estado: Estado;
  procedimiento: string | null;
  autoridad: string | null;
  url: string | null;
  fecha_publicacion: string | null;
  fecha_fin: string | null;
  lote_numero: number;
  valor_subasta: number | null;
  valor_tasacion: number | null;
  puja_minima: number | null;
  deposito: number | null;
  cargas_importe: number | null;
  cargas_subsisten: boolean | null;
  cargas_texto: string | null;
  situacion: Situacion;
  vivienda_habitual: boolean | null;
  confianza_extraccion: number | null;
  cargas_evidencia: string | null;
  situacion_evidencia: string | null;
  extraccion_regla: string | null;
  extraccion_origen: string | null;
  bien_id: number | null;
  bien_tipo: TipoBien | null;
  direccion: string | null;
  codigo_postal: string | null;
  municipio: string | null;
  provincia: string | null;
  comunidad: string | null;
  referencia_catastral: string | null;
  cuota_propiedad: number | null;
  lat: number | null;
  lon: number | null;
  precision_geo: PrecisionGeo | null;
  m2_construidos: number | null;
  anio_construccion: number | null;
  precio_m2_zona: number | null;
  valor_estimado: number | null;
  confianza_valor: number | null;
  num_bienes: number;
  eur_m2_salida: number | null;
  margen_bruto: number | null;
}

export const ETIQUETA_TIPO_BIEN: Record<TipoBien, string> = {
  vivienda: "Vivienda", garaje: "Garaje", trastero: "Trastero", local: "Local",
  nave: "Nave", oficina: "Oficina", suelo: "Suelo", rustica: "Finca rústica",
  edificio: "Edificio", otro: "Otro",
};

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  publicada: "Publicada", celebrandose: "Celebrándose",
  puja_concluida: "Puja concluida", finalizada: "Finalizada",
  cancelada: "Cancelada", suspendida: "Suspendida", desconocido: "Sin determinar",
};

export const ETIQUETA_TIPO_SUBASTA: Record<TipoSubasta, string> = {
  judicial: "Judicial", aeat: "Agencia Tributaria",
  seguridad_social: "Seguridad Social", notarial: "Notarial",
  concursal: "Concursal", otra: "Otra",
};

export const ETIQUETA_SITUACION: Record<Situacion, string> = {
  ocupado: "Ocupado", libre: "Libre", desconocido: "Sin determinar",
};

export const ETIQUETA_PRECISION: Record<PrecisionGeo, string> = {
  catastral: "Referencia catastral",
  portal: "Portal exacto",
  via: "Calle, sin número",
  municipio: "Solo municipio",
  ninguna: "Sin localizar",
};
