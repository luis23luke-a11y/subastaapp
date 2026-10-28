import Calculadora from "@/components/Calculadora";
import Evidencia from "@/components/Evidencia";
import { eur, fecha, m2, pct, plazoTexto } from "@/lib/formato";
import {
  ETIQUETA_ESTADO, ETIQUETA_PRECISION, ETIQUETA_SITUACION,
  ETIQUETA_TIPO_BIEN, ETIQUETA_TIPO_SUBASTA, type LoteBusqueda,
} from "@/lib/tipos";

// El contenido de la ficha de un lote, el mismo en el cajon y en la pagina
// completa. Una sola columna, de arriba abajo: que es y cuanto vale, lo que
// decide una puja (cargas y ocupacion, con su cita), la calculadora, los
// datos de la subasta, los bienes y el historial.

export interface Bien {
  id: number; tipo: string; descripcion: string | null; direccion: string | null;
  municipio: string | null; provincia: string | null; referencia_catastral: string | null;
  cuota_propiedad: number; m2_construidos: number | null; anio_construccion: number | null;
  precision_geo: string | null;
}

export interface Instantanea {
  momento: string; estado: string | null; num_pujas: number | null; puja_actual: number | null;
}

export default function FichaLote({
  lote, bienes, historico,
}: {
  lote: LoteBusqueda;
  bienes: Bien[];
  historico: Instantanea[];
}) {
  const tonoCargas = lote.cargas_subsisten == null ? "aviso" : lote.cargas_subsisten ? "malo" : "bueno";
  const tonoSituacion = lote.situacion === "ocupado" ? "malo" : lote.situacion === "libre" ? "bueno" : "aviso";

  return (
    <article>
      <p className="eyebrow" style={{ margin: 0 }}>
        {ETIQUETA_TIPO_SUBASTA[lote.tipo]} · {ETIQUETA_ESTADO[lote.estado]} · {plazoTexto(lote.fecha_fin)}
      </p>
      <h2 className="ficha-nom">
        {lote.bien_tipo ? ETIQUETA_TIPO_BIEN[lote.bien_tipo] : "Lote"} en{" "}
        {lote.municipio ?? "ubicación sin determinar"}
      </h2>
      <p className="ficha-q">
        {lote.direccion ?? "Dirección no publicada"}
        {lote.provincia ? ` · ${lote.provincia}` : ""}
        {" · "}<span className="cifra">{lote.id_externo}</span>
      </p>

      <div className="ficha-precio">
        <b className="cifra">{eur(lote.valor_subasta)}</b>
        <span>valor de salida</span>
        {lote.eur_m2_salida != null && <span className="cifra">{eur(lote.eur_m2_salida)}/m²</span>}
        {lote.margen_bruto != null && (
          <span className={`cifra ${lote.margen_bruto >= 0.3 ? "text-bueno" : lote.margen_bruto >= 0.1 ? "text-aviso" : "text-malo"}`}>
            margen {pct(lote.margen_bruto)}
          </span>
        )}
      </div>

      <div className="tags" style={{ marginTop: 14 }}>
        {lote.situacion === "ocupado" && <span className="pill malo">Ocupado</span>}
        {lote.situacion === "libre" && <span className="pill bueno">Libre</span>}
        {lote.situacion === "desconocido" && <span className="pill aviso">Posesión sin determinar</span>}
        {lote.cargas_subsisten && <span className="pill malo">Cargas que subsisten</span>}
        {lote.cargas_subsisten === false && <span className="pill bueno">Sin cargas anteriores</span>}
        {lote.vivienda_habitual && <span className="pill aviso">Vivienda habitual</span>}
        {lote.cuota_propiedad != null && lote.cuota_propiedad < 1 && (
          <span className="pill aviso">Cuota {pct(lote.cuota_propiedad)}</span>
        )}
        {lote.num_bienes > 1 && <span className="pill apagado">{lote.num_bienes} bienes</span>}
        {lote.precision_geo && lote.precision_geo !== "catastral" && lote.precision_geo !== "portal" && (
          <span className="pill apagado">{ETIQUETA_PRECISION[lote.precision_geo]}</span>
        )}
      </div>

      <div className="ficha-enlaces">
        {lote.url && (
          <a href={lote.url} target="_blank" rel="noreferrer" className="btn small">Ficha oficial en el portal</a>
        )}
        {lote.fuente === "boe" && (
          <span className="cita">
            Basado en datos de la{" "}
            <a href="https://www.boe.es" target="_blank" rel="noreferrer">Agencia Estatal Boletín Oficial del Estado</a>
          </span>
        )}
      </div>

      <h3 className="ficha-h">Cargas y situación posesoria</h3>
      <div>
        <Evidencia
          titulo="Cargas anteriores que subsisten"
          valor={lote.cargas_subsisten == null ? "Sin determinar"
            : lote.cargas_subsisten ? `Sí${lote.cargas_importe ? ` · ${eur(lote.cargas_importe)}` : ""}` : "No"}
          tono={tonoCargas}
          cita={lote.cargas_evidencia}
          confianza={lote.confianza_extraccion}
          origen={lote.extraccion_origen}
        />
        <Evidencia
          titulo="Situación posesoria"
          valor={ETIQUETA_SITUACION[lote.situacion]}
          tono={tonoSituacion}
          cita={lote.situacion_evidencia}
          confianza={lote.confianza_extraccion}
          origen={lote.extraccion_origen}
        />
        <Evidencia
          titulo="Vivienda habitual del ejecutado"
          valor={lote.vivienda_habitual == null ? "Sin determinar" : lote.vivienda_habitual ? "Sí" : "No"}
          tono={lote.vivienda_habitual ? "aviso" : "neutro"}
          cita={null}
          confianza={lote.vivienda_habitual == null ? 0 : lote.confianza_extraccion}
          origen={lote.extraccion_origen}
        />
      </div>
      <details className="raw">
        <summary>Texto completo del anuncio sobre cargas y posesión</summary>
        <div className="texto">{lote.cargas_texto ?? "El anuncio no incluye información sobre cargas."}</div>
      </details>
      <p className="ficha-nota">
        La fórmula «las cargas anteriores, si las hubiere, continuarán subsistentes» es obligatoria
        por ley y aparece en casi todos los anuncios: por sí sola no significa que existan cargas.
        Verifica siempre con la nota simple del registro antes de pujar.
      </p>

      <h3 className="ficha-h">Calculadora de coste y margen</h3>
      <Calculadora
        datos={{
          valorSubasta: lote.valor_subasta ?? 0,
          comunidad: lote.comunidad,
          tipoSubasta: lote.tipo,
          situacion: lote.situacion,
          cargasSubsisten: lote.cargas_importe,
          m2: lote.m2_construidos,
          valorMercado: lote.valor_estimado,
          cuotaPropiedad: lote.cuota_propiedad,
        }}
      />

      <h3 className="ficha-h">Datos de la subasta</h3>
      <dl className="datos">
        <div><dt>Valor de salida</dt><dd>{eur(lote.valor_subasta)}</dd></div>
        <div><dt>Tasación</dt><dd>{eur(lote.valor_tasacion)}</dd></div>
        <div><dt>Puja mínima</dt><dd>{eur(lote.puja_minima)}</dd></div>
        <div><dt>Depósito</dt><dd>{eur(lote.deposito)}</dd></div>
        <div><dt>Cierra</dt><dd>{fecha(lote.fecha_fin)}</dd></div>
        <div><dt>Publicada</dt><dd>{fecha(lote.fecha_publicacion)}</dd></div>
        <div><dt>Procedimiento</dt><dd>{lote.procedimiento ?? "—"}</dd></div>
        <div><dt>Autoridad</dt><dd>{lote.autoridad ?? "—"}</dd></div>
      </dl>

      <h3 className="ficha-h">Valoración y localización</h3>
      <dl className="datos tres">
        <div><dt>Superficie</dt><dd>{m2(lote.m2_construidos)}</dd></div>
        <div><dt>Año</dt><dd>{lote.anio_construccion ?? "—"}</dd></div>
        <div><dt>€/m² de salida</dt><dd>{eur(lote.eur_m2_salida)}</dd></div>
        <div><dt>€/m² de zona</dt><dd>{eur(lote.precio_m2_zona)}</dd></div>
        <div><dt>Valor estimado</dt><dd>{eur(lote.valor_estimado)}</dd></div>
        <div><dt>Margen bruto</dt><dd>{pct(lote.margen_bruto)}</dd></div>
      </dl>
      <p className="ficha-nota">
        Localización: {lote.precision_geo ? ETIQUETA_PRECISION[lote.precision_geo] : "sin determinar"}.
        {lote.confianza_valor != null && ` Confianza de la valoración: ${pct(lote.confianza_valor)}.`}
        {" "}La valoración es una estimación por zona, no una tasación.
      </p>

      <h3 className="ficha-h">Bienes del lote ({bienes.length})</h3>
      <div className="scroll-x">
        <table className="tabla">
          <thead>
            <tr>
              <th>Tipo</th><th>Dirección</th><th>Ref. catastral</th>
              <th className="num">Superficie</th><th className="num">Cuota</th>
            </tr>
          </thead>
          <tbody>
            {bienes.map((b) => (
              <tr key={b.id}>
                <td>{b.tipo}</td>
                <td>{b.direccion ?? "—"}</td>
                <td className="cifra" style={{ fontSize: ".82rem" }}>{b.referencia_catastral ?? "—"}</td>
                <td className="num">{m2(b.m2_construidos)}</td>
                <td className="num">{pct(b.cuota_propiedad)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {historico.length > 0 && (
        <>
          <h3 className="ficha-h">Historial observado</h3>
          <ol className="tl">
            {historico.map((h, i) => (
              <li key={i} className={i === historico.length - 1 ? "hot" : ""}>
                <time className="cifra">{fecha(h.momento)}</time>
                <span className="ev">
                  {h.estado ? ETIQUETA_ESTADO[h.estado as keyof typeof ETIQUETA_ESTADO] : "—"}
                  {h.num_pujas != null && (
                    <small>{h.num_pujas === 0 ? "sin pujas" : h.num_pujas === 1 ? "con puja" : `${h.num_pujas} pujas`}</small>
                  )}
                  {h.puja_actual != null && <small className="cifra">{eur(h.puja_actual)}</small>}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </article>
  );
}
