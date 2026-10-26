// ---------------------------------------------------------------------------
// Interfaz del adaptador de ingesta.
//
// La fuente se enchufa aqui y nada mas de la aplicacion la conoce: cambiarla
// es escribir un fichero en adaptadores/. Hay dos: muestra.ts genera datos
// sinteticos, y boe.ts lee el Portal de Subastas del BOE sin sesion y despacio
// (la base legal y sus limites estan en el README).
// ---------------------------------------------------------------------------

import type { Estado, PrecisionGeo, Situacion, TipoBien, TipoSubasta } from "@/lib/tipos";

export interface BienBruto {
  tipo: TipoBien;
  descripcion?: string | null;
  direccion?: string | null;
  codigoPostal?: string | null;
  municipio?: string | null;
  provincia?: string | null;
  comunidad?: string | null;
  referenciaCatastral?: string | null;
  cuotaPropiedad?: number | null;
  inscripcionRegistral?: string | null;
  /** Lo que el adaptador ya sabe. El enriquecimiento posterior lo completa. */
  enriquecido?: {
    lat?: number | null;
    lon?: number | null;
    precisionGeo?: PrecisionGeo;
    m2Construidos?: number | null;
    anioConstruccion?: number | null;
    usoCatastral?: string | null;
    precioM2Zona?: number | null;
    valorEstimado?: number | null;
    confianzaValor?: number | null;
  } | null;
}

export interface LoteBruto {
  numero: number;
  valorSubasta?: number | null;
  valorTasacion?: number | null;
  pujaMinima?: number | null;
  deposito?: number | null;
  tramos?: number | null;
  cantidadReclamada?: number | null;
  estado?: Estado | null;
  cargasTexto?: string | null;
  cargasImporte?: number | null;
  cargasSubsisten?: boolean | null;
  situacion?: Situacion;
  viviendaHabitual?: boolean | null;
  confianzaExtraccion?: number | null;
  numPujas?: number | null;
  pujaActual?: number | null;
  bienes: BienBruto[];
}

export interface SubastaBruta {
  idExterno: string;
  tipo: TipoSubasta;
  estado: Estado;
  procedimiento?: string | null;
  expediente?: string | null;
  autoridad?: string | null;
  fechaPublicacion?: string | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  url?: string | null;
  lotes: LoteBruto[];
}

/** Lo que devolvio la fuente antes de parsearlo. Se guarda tal cual para
 *  poder reparsear sin volver a pedirselo al origen: el dia que mejoremos la
 *  extraccion de cargas, eso es la diferencia entre una tarde y tres semanas.
 *  El portal sirve cada subasta en varias pestañas, de ahi que sea una lista. */
export interface Crudo {
  etiqueta: string;
  contenido: string;
  tipoMime?: string;
}

export interface ResultadoDetalle {
  subasta: SubastaBruta;
  crudo?: Crudo[];
}

/**
 * Lo que cambia de una subasta ya bajada: su estado, sus fechas y las pujas
 * de cada lote. Nada mas. Los bienes, las cargas, la autoridad y los importes
 * no cambian una vez publicada la subasta, y no volver a pedirlos es lo que
 * hace que un refresco cueste dos peticiones al portal en vez de cuatro o
 * cinco. Que sea un tipo aparte, y no una SubastaBruta a medias, es lo que
 * impide que un refresco pise con nulos lo que ya estaba guardado.
 */
export interface LoteRefrescado {
  numero: number;
  estado?: Estado | null;
  numPujas?: number | null;
  pujaActual?: number | null;
}

export interface SubastaRefrescada {
  idExterno: string;
  estado: Estado;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  lotes: LoteRefrescado[];
}

export interface ResultadoRefresco {
  subasta: SubastaRefrescada;
  crudo?: Crudo[];
}

export interface Adaptador {
  /** Se guarda en subasta.fuente y forma la clave unica con el id externo. */
  readonly nombre: string;
  /** Milisegundos minimos entre peticiones a la fuente. */
  readonly msEntrePeticiones: number;
  /** Ids de subastas nuevas o cambiadas desde una fecha. */
  descubrir(desde: Date): AsyncIterable<string>;
  /** Detalle completo de una subasta. null si ya no existe en el origen. */
  detalle(idExterno: string): Promise<ResultadoDetalle | null>;
  /**
   * Solo lo que cambia de una subasta ya bajada (estado, fechas y pujas), con
   * menos peticiones que el detalle completo. Opcional: si la fuente no lo
   * ofrece, el worker refresca con `detalle`. null si ya no existe en el
   * origen.
   */
  detalleLigero?(idExterno: string): Promise<ResultadoRefresco | null>;
}
