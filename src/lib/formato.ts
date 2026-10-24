const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency", currency: "EUR", maximumFractionDigits: 0,
});
const EUR2 = new Intl.NumberFormat("es-ES", {
  style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const ENTERO = new Intl.NumberFormat("es-ES");
const PCT = new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 1 });
const FECHA = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });

export const eur = (v: number | null | undefined) => (v == null ? "—" : EUR.format(v));
export const eur2 = (v: number | null | undefined) => (v == null ? "—" : EUR2.format(v));
export const entero = (v: number | null | undefined) => (v == null ? "—" : ENTERO.format(v));
export const pct = (v: number | null | undefined) => (v == null ? "—" : PCT.format(v));

export const fecha = (v: string | Date | null | undefined) => {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? "—" : FECHA.format(d);
};

export const m2 = (v: number | null | undefined) =>
  v == null ? "—" : `${ENTERO.format(Math.round(v))} m²`;

/** Dias que faltan para una fecha. Negativo si ya paso. */
export function diasHasta(v: string | Date | null | undefined): number | null {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export function plazoTexto(v: string | Date | null | undefined): string {
  const d = diasHasta(v);
  if (d == null) return "Sin fecha de cierre";
  if (d < 0) return "Cerrada";
  if (d === 0) return "Cierra hoy";
  if (d === 1) return "Cierra mañana";
  return `Cierra en ${d} días`;
}
