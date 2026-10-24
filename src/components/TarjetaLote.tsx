import Link from "next/link";
import { eur, fecha, m2, pct, plazoTexto } from "@/lib/formato";
import { ETIQUETA_ESTADO, ETIQUETA_SITUACION, ETIQUETA_TIPO_BIEN, type LoteBusqueda } from "@/lib/tipos";

function Pastilla({ tono, children }: { tono: "neutro" | "bueno" | "aviso" | "malo"; children: React.ReactNode }) {
  const clases = {
    neutro: "border-linea text-apagado",
    bueno: "border-bueno/40 text-bueno",
    aviso: "border-aviso/40 text-aviso",
    malo: "border-malo/40 text-malo",
  }[tono];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] leading-5 ${clases}`}>{children}</span>
  );
}

export default function TarjetaLote({ lote }: { lote: LoteBusqueda }) {
  const margen = lote.margen_bruto;
  const tonoMargen = margen == null ? "neutro" : margen >= 0.3 ? "bueno" : margen >= 0.1 ? "aviso" : "malo";

  return (
    <Link
      href={`/lote/${lote.lote_id}`}
      className="flex flex-col gap-3 rounded-xl border border-linea bg-panel p-4 transition hover:border-acento/60 focus:outline-none focus:ring-2 focus:ring-acento"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {lote.bien_tipo ? ETIQUETA_TIPO_BIEN[lote.bien_tipo] : "Lote"} en {lote.municipio ?? "sin localizar"}
          </p>
          <p className="truncate text-xs text-apagado">
            {lote.direccion ?? "Dirección no publicada"}
            {lote.provincia ? ` · ${lote.provincia}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="cifra text-base font-medium">{eur(lote.valor_subasta)}</p>
          {lote.eur_m2_salida != null && (
            <p className="cifra text-xs text-apagado">{eur(lote.eur_m2_salida)}/m²</p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-apagado">Superficie</dt>
          <dd className="cifra">{m2(lote.m2_construidos)}</dd>
        </div>
        <div>
          <dt className="text-apagado">Depósito</dt>
          <dd className="cifra">{eur(lote.deposito)}</dd>
        </div>
        <div>
          <dt className="text-apagado">Margen bruto</dt>
          <dd className="cifra">{pct(margen)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-1.5">
        <Pastilla tono={tonoMargen}>{plazoTexto(lote.fecha_fin)}</Pastilla>
        <Pastilla tono="neutro">{ETIQUETA_ESTADO[lote.estado]}</Pastilla>
        {lote.situacion === "ocupado" && <Pastilla tono="malo">Ocupado</Pastilla>}
        {lote.situacion === "libre" && <Pastilla tono="bueno">Libre</Pastilla>}
        {lote.situacion === "desconocido" && <Pastilla tono="aviso">Posesión sin determinar</Pastilla>}
        {lote.cargas_subsisten && <Pastilla tono="malo">Cargas que subsisten</Pastilla>}
        {lote.cuota_propiedad != null && lote.cuota_propiedad < 1 && (
          <Pastilla tono="aviso">Cuota {pct(lote.cuota_propiedad)}</Pastilla>
        )}
        {lote.num_bienes > 1 && <Pastilla tono="neutro">{lote.num_bienes} bienes</Pastilla>}
        {lote.precision_geo === "municipio" && <Pastilla tono="aviso">Solo municipio</Pastilla>}
      </div>

      <p className="text-[11px] text-apagado">
        {lote.id_externo} · publicada {fecha(lote.fecha_publicacion)}
        {lote.situacion === "ocupado" || lote.cargas_subsisten
          ? " · " + ETIQUETA_SITUACION[lote.situacion]
          : ""}
      </p>
    </Link>
  );
}
