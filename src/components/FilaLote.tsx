import Link from "next/link";
import { diasHasta, eur, m2, pct, plazoTexto } from "@/lib/formato";
import { ETIQUETA_ESTADO, ETIQUETA_TIPO_BIEN, type LoteBusqueda } from "@/lib/tipos";

// Una fila por lote, como la lista de empresas de Maqro ES: lo que decide si
// merece abrir la ficha cabe en una linea y media. Al pulsarla, la ficha se
// abre en un cajon a la derecha; `lista` lleva los ids de la pagina para que
// el cajon pueda ir al anterior y al siguiente sin volver a la lista.

export default function FilaLote({ lote, lista }: { lote: LoteBusqueda; lista: string }) {
  const dias = diasHasta(lote.fecha_fin);
  const cerrada = dias != null && dias < 0;
  const urgente = dias != null && dias >= 0 && dias <= 3;
  const margen = lote.margen_bruto;
  const tonoMargen = margen == null ? "" : margen >= 0.3 ? "bueno" : margen >= 0.1 ? "aviso" : "malo";

  const etiquetas: Array<{ texto: string; tono: string }> = [];
  if (lote.situacion === "ocupado") etiquetas.push({ texto: "Ocupado", tono: "malo" });
  if (lote.situacion === "libre") etiquetas.push({ texto: "Libre", tono: "bueno" });
  if (lote.cargas_subsisten) etiquetas.push({ texto: "Cargas", tono: "malo" });
  if (lote.cuota_propiedad != null && lote.cuota_propiedad < 1) {
    etiquetas.push({ texto: `Cuota ${pct(lote.cuota_propiedad)}`, tono: "aviso" });
  }
  if (lote.estado === "publicada") etiquetas.push({ texto: "Próxima apertura", tono: "apagado" });
  if (lote.estado === "suspendida") etiquetas.push({ texto: "Suspendida", tono: "apagado" });

  return (
    <li className={`fila${urgente ? " urgente" : ""}${cerrada ? " cerrada" : ""}`}>
      <Link href={`/lote/${lote.lote_id}?lista=${lista}`} className="fila-abre" scroll={false}>
        <span className="f-nom">
          {lote.bien_tipo ? ETIQUETA_TIPO_BIEN[lote.bien_tipo] : "Lote"} en {lote.municipio ?? "sin localizar"}
        </span>
        <span className="f-meta">
          <span className="f-cat">{lote.direccion ?? "Dirección no publicada"}</span>
          {lote.provincia && <span>{lote.provincia}</span>}
          {lote.m2_construidos != null && <span>{m2(lote.m2_construidos)}</span>}
          <span>{cerrada ? ETIQUETA_ESTADO[lote.estado] : plazoTexto(lote.fecha_fin)}</span>
          {lote.num_bienes > 1 && <span>{lote.num_bienes} bienes</span>}
        </span>
      </Link>
      <div className="f-etq">
        {etiquetas.map((e) => <span key={e.texto} className={`pill ${e.tono}`}>{e.texto}</span>)}
      </div>
      <div className="f-der">
        <b className="f-precio">{eur(lote.valor_subasta)}</b>
        {margen != null
          ? <small className={`f-sub ${tonoMargen}`}>margen {pct(margen)}</small>
          : lote.eur_m2_salida != null
            ? <small className="f-sub">{eur(lote.eur_m2_salida)}/m²</small>
            : null}
      </div>
    </li>
  );
}
