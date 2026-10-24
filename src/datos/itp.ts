// ---------------------------------------------------------------------------
// Tipos generales de ITP (Transmisiones Patrimoniales Onerosas) por comunidad.
//
// ATENCION: estos valores son ORIENTATIVOS y estan sin verificar. Son el tipo
// general; casi todas las comunidades tienen tipos reducidos (vivienda
// habitual, jovenes, familia numerosa, discapacidad) y algunas aplican una
// escala por tramos en lugar de un tipo unico. Cambian con cada ley de
// presupuestos autonomica.
//
// Antes de cobrar a un cliente: que un asesor fiscal revise esta tabla y
// cambie `verificado` a true, con la fecha de revision.
// ---------------------------------------------------------------------------

export interface TipoItp {
  comunidad: string;
  tipoGeneral: number;
  verificado: boolean;
  nota?: string;
}

export const ITP_POR_COMUNIDAD: Record<string, TipoItp> = {
  "Andalucía":             { comunidad: "Andalucía", tipoGeneral: 0.07, verificado: false },
  "Aragón":                { comunidad: "Aragón", tipoGeneral: 0.08, verificado: false, nota: "Escala por tramos" },
  "Asturias":              { comunidad: "Asturias", tipoGeneral: 0.08, verificado: false, nota: "Escala por tramos" },
  "Baleares":              { comunidad: "Baleares", tipoGeneral: 0.08, verificado: false, nota: "Escala por tramos" },
  "Canarias":              { comunidad: "Canarias", tipoGeneral: 0.065, verificado: false },
  "Cantabria":             { comunidad: "Cantabria", tipoGeneral: 0.09, verificado: false },
  "Castilla-La Mancha":    { comunidad: "Castilla-La Mancha", tipoGeneral: 0.09, verificado: false },
  "Castilla y León":       { comunidad: "Castilla y León", tipoGeneral: 0.08, verificado: false, nota: "Escala por tramos" },
  "Cataluña":              { comunidad: "Cataluña", tipoGeneral: 0.10, verificado: false, nota: "Escala por tramos" },
  "Ceuta":                 { comunidad: "Ceuta", tipoGeneral: 0.06, verificado: false },
  "Comunidad de Madrid":   { comunidad: "Comunidad de Madrid", tipoGeneral: 0.06, verificado: false },
  "Comunidad Valenciana":  { comunidad: "Comunidad Valenciana", tipoGeneral: 0.10, verificado: false },
  "Extremadura":           { comunidad: "Extremadura", tipoGeneral: 0.08, verificado: false, nota: "Escala por tramos" },
  "Galicia":               { comunidad: "Galicia", tipoGeneral: 0.08, verificado: false },
  "La Rioja":              { comunidad: "La Rioja", tipoGeneral: 0.07, verificado: false },
  "Melilla":               { comunidad: "Melilla", tipoGeneral: 0.06, verificado: false },
  "Murcia":                { comunidad: "Murcia", tipoGeneral: 0.08, verificado: false },
  "Navarra":               { comunidad: "Navarra", tipoGeneral: 0.06, verificado: false },
  "País Vasco":            { comunidad: "País Vasco", tipoGeneral: 0.07, verificado: false, nota: "Tipo reducido del 4% habitual" },
};

/** Tipo a aplicar cuando no conocemos la comunidad: el mas alto, para no
 *  prometer un margen que luego no esta. */
export const ITP_POR_DEFECTO = 0.10;

export function tipoItp(comunidad: string | null | undefined): TipoItp {
  if (!comunidad) {
    return { comunidad: "Sin determinar", tipoGeneral: ITP_POR_DEFECTO, verificado: false,
             nota: "Sin comunidad conocida: se aplica el tipo mas alto por prudencia" };
  }
  return ITP_POR_COMUNIDAD[comunidad] ?? {
    comunidad, tipoGeneral: ITP_POR_DEFECTO, verificado: false,
    nota: "Comunidad no reconocida: se aplica el tipo mas alto por prudencia",
  };
}
