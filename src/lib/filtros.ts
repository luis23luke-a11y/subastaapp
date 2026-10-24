import { z } from "zod";
import { ESTADOS, SITUACIONES, TIPOS_BIEN, TIPOS_SUBASTA } from "@/lib/tipos";

// Un filtro se serializa en la URL (compartible, marcable) y es tambien lo que
// se guarda en alerta.filtro, para que una busqueda y una alerta sean lo mismo.

const lista = <T extends readonly [string, ...string[]]>(valores: T) =>
  z.string().transform((s) => s.split(",").filter(Boolean))
    .pipe(z.array(z.enum(valores)))
    .optional();

export const esquemaFiltro = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  provincia: z.string().trim().max(60).optional(),
  tipo_bien: lista(TIPOS_BIEN),
  tipo_subasta: lista(TIPOS_SUBASTA),
  estado: lista(ESTADOS),
  situacion: lista(SITUACIONES),
  precio_min: z.coerce.number().min(0).optional(),
  precio_max: z.coerce.number().min(0).optional(),
  m2_min: z.coerce.number().min(0).optional(),
  eur_m2_max: z.coerce.number().min(0).optional(),
  margen_min: z.coerce.number().min(-1).max(1).optional(),
  dias_max: z.coerce.number().int().min(0).max(400).optional(),
  sin_cargas: z.coerce.boolean().optional(),
  bbox: z.string().regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/).optional(),
  orden: z.enum(["cierre", "precio_asc", "precio_desc", "margen", "nuevos"]).default("cierre"),
  pagina: z.coerce.number().int().min(1).max(500).default(1),
});

export type Filtro = z.infer<typeof esquemaFiltro>;

export const POR_PAGINA = 24;

export function leerFiltro(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): Filtro {
  // Un formulario GET con varias casillas del mismo nombre manda el parametro
  // repetido (tipo_bien=vivienda&tipo_bien=garaje). Hay que unirlos con coma,
  // que es el formato que espera el esquema; quedarse con el ultimo perderia
  // silenciosamente la seleccion del usuario.
  const plano: Record<string, string | undefined> = {};
  if (params instanceof URLSearchParams) {
    for (const clave of new Set(params.keys())) {
      plano[clave] = params.getAll(clave).filter(Boolean).join(",");
    }
  } else {
    for (const [clave, valor] of Object.entries(params)) {
      plano[clave] = Array.isArray(valor) ? valor.filter(Boolean).join(",") : valor;
    }
  }
  const limpio = Object.fromEntries(
    Object.entries(plano).filter(([, v]) => v !== undefined && v !== ""),
  );
  const res = esquemaFiltro.safeParse(limpio);
  // Un filtro invalido en la URL no debe tumbar la pagina: se cae a los valores
  // por defecto y el usuario ve el listado completo.
  return res.success ? res.data : esquemaFiltro.parse({});
}

const ORDEN_SQL: Record<Filtro["orden"], string> = {
  // "Cierran antes" significa las que todavia se pueden pujar, no las que
  // cerraron hace mas tiempo. Primero las abiertas de mas cercana a mas
  // lejana, y despues las cerradas de mas reciente a mas antigua.
  cierre:
    "case when fecha_fin >= now() then 0 else 1 end asc, " +
    "case when fecha_fin >= now() then fecha_fin end asc nulls last, " +
    "fecha_fin desc nulls last",
  precio_asc: "valor_subasta asc nulls last",
  precio_desc: "valor_subasta desc nulls last",
  margen: "margen_bruto desc nulls last",
  nuevos: "fecha_publicacion desc nulls last",
};

export interface ConsultaConstruida {
  where: string;
  orderBy: string;
  valores: unknown[];
}

/** Traduce el filtro a SQL con parametros numerados. Nada se interpola. */
export function construirConsulta(f: Filtro): ConsultaConstruida {
  const cond: string[] = [];
  const val: unknown[] = [];
  const p = (v: unknown) => `$${val.push(v)}`;

  if (f.q) {
    const t = p(f.q);
    cond.push(`(municipio ilike '%' || ${t} || '%' or direccion ilike '%' || ${t} || '%' or id_externo ilike '%' || ${t} || '%')`);
  }
  if (f.provincia) cond.push(`provincia = ${p(f.provincia)}`);
  if (f.tipo_bien?.length) cond.push(`bien_tipo = any(${p(f.tipo_bien)}::tipo_bien[])`);
  if (f.tipo_subasta?.length) cond.push(`tipo = any(${p(f.tipo_subasta)}::tipo_subasta[])`);
  if (f.estado?.length) cond.push(`estado = any(${p(f.estado)}::estado_subasta[])`);
  if (f.situacion?.length) cond.push(`situacion = any(${p(f.situacion)}::situacion_posesoria[])`);
  if (f.precio_min != null) cond.push(`valor_subasta >= ${p(f.precio_min)}`);
  if (f.precio_max != null) cond.push(`valor_subasta <= ${p(f.precio_max)}`);
  if (f.m2_min != null) cond.push(`m2_construidos >= ${p(f.m2_min)}`);
  if (f.eur_m2_max != null) cond.push(`eur_m2_salida <= ${p(f.eur_m2_max)}`);
  if (f.margen_min != null) cond.push(`margen_bruto >= ${p(f.margen_min)}`);
  if (f.dias_max != null) {
    cond.push(`fecha_fin is not null and fecha_fin <= now() + make_interval(days => ${p(f.dias_max)})`);
  }
  if (f.sin_cargas) cond.push(`coalesce(cargas_subsisten, true) = false`);
  if (f.bbox) {
    const [oeste, sur, este, norte] = f.bbox.split(",").map(Number) as [number, number, number, number];
    cond.push(`geom && st_makeenvelope(${p(oeste)}, ${p(sur)}, ${p(este)}, ${p(norte)}, 4326)`);
  }

  return {
    where: cond.length ? `where ${cond.join("\n  and ")}` : "",
    orderBy: ORDEN_SQL[f.orden],
    valores: val,
  };
}

/** El filtro de vuelta a querystring, para enlaces compartibles. */
export function aQuerystring(f: Partial<Filtro>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if (k === "pagina" && v === 1) continue;
    if (k === "orden" && v === "cierre") continue;
    qs.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  return qs.toString();
}
