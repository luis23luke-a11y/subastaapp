import Link from "next/link";
import { notFound } from "next/navigation";
import Calculadora from "@/components/Calculadora";
import Evidencia from "@/components/Evidencia";
import { bienesDelLote, historicoLote, lotePorId } from "@/lib/consultas";
import { eur, fecha, m2, pct, plazoTexto } from "@/lib/formato";
import {
  ETIQUETA_ESTADO, ETIQUETA_PRECISION, ETIQUETA_SITUACION,
  ETIQUETA_TIPO_BIEN, ETIQUETA_TIPO_SUBASTA,
} from "@/lib/tipos";

export const dynamic = "force-dynamic";

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-apagado">{titulo}</dt>
      <dd className="cifra text-sm">{children}</dd>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-linea bg-panel p-4">
      <h2 className="mb-3 text-sm font-medium">{titulo}</h2>
      {children}
    </section>
  );
}

export default async function FichaLote({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loteId = Number.parseInt(id, 10);
  if (!Number.isFinite(loteId)) notFound();

  const lote = await lotePorId(loteId);
  if (!lote) notFound();

  const [bienes, historico] = await Promise.all([
    bienesDelLote(loteId),
    historicoLote(loteId),
  ]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4">
      <Link href="/buscar" className="text-xs text-acento underline">← Volver al buscador</Link>

      <header className="rounded-xl border border-linea bg-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-medium">
              {lote.bien_tipo ? ETIQUETA_TIPO_BIEN[lote.bien_tipo] : "Lote"} en{" "}
              {lote.municipio ?? "ubicación sin determinar"}
            </h1>
            <p className="text-sm text-apagado">
              {lote.direccion ?? "Dirección no publicada"}
              {lote.provincia ? ` · ${lote.provincia}` : ""}
            </p>
            <p className="mt-1 text-xs text-apagado">
              {lote.id_externo} · {ETIQUETA_TIPO_SUBASTA[lote.tipo]} ·{" "}
              {ETIQUETA_ESTADO[lote.estado]} · {plazoTexto(lote.fecha_fin)}
            </p>
          </div>
          <div className="text-right">
            <p className="cifra text-2xl">{eur(lote.valor_subasta)}</p>
            <p className="text-xs text-apagado">valor de salida</p>
            {lote.url && (
              <a href={lote.url} target="_blank" rel="noreferrer"
                 className="mt-1 inline-block text-xs text-acento underline">
                Ficha oficial en el origen
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          <Bloque titulo="Calculadora de coste y margen">
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
          </Bloque>

          <Bloque titulo="Cargas y situación posesoria">
            <div className="flex flex-col">
              <Evidencia
                titulo="Cargas anteriores que subsisten"
                valor={
                  lote.cargas_subsisten == null
                    ? "Sin determinar"
                    : lote.cargas_subsisten
                      ? `Sí${lote.cargas_importe ? ` · ${eur(lote.cargas_importe)}` : ""}`
                      : "No"
                }
                tono={lote.cargas_subsisten == null ? "aviso" : lote.cargas_subsisten ? "malo" : "bueno"}
                cita={lote.cargas_evidencia}
                confianza={lote.confianza_extraccion}
                origen={lote.extraccion_origen}
              />
              <Evidencia
                titulo="Situación posesoria"
                valor={ETIQUETA_SITUACION[lote.situacion]}
                tono={lote.situacion === "ocupado" ? "malo" : lote.situacion === "libre" ? "bueno" : "aviso"}
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

            <details className="mt-3 rounded-lg border border-linea bg-fondo">
              <summary className="cursor-pointer px-3 py-2 text-xs text-apagado">
                Texto completo del anuncio
              </summary>
              <p className="whitespace-pre-line border-t border-linea px-3 py-3 text-sm leading-relaxed">
                {lote.cargas_texto ?? "El anuncio no incluye información sobre cargas."}
              </p>
            </details>

            <p className="mt-3 text-xs text-apagado">
              La fórmula «las cargas anteriores, si las hubiere, continuarán subsistentes» es
              obligatoria por ley y aparece en casi todos los anuncios: por sí sola no significa
              que existan cargas, y por eso aquí no cuenta como prueba. Verifica siempre con la
              nota simple del registro antes de pujar.
            </p>
          </Bloque>

          <Bloque titulo={`Bienes del lote (${bienes.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-xs text-apagado">
                    <th className="py-1.5 pr-3 font-medium">Tipo</th>
                    <th className="py-1.5 pr-3 font-medium">Dirección</th>
                    <th className="py-1.5 pr-3 font-medium">Referencia catastral</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Superficie</th>
                    <th className="py-1.5 text-right font-medium">Cuota</th>
                  </tr>
                </thead>
                <tbody>
                  {bienes.map((b) => (
                    <tr key={b.id} className="border-b border-linea">
                      <td className="py-1.5 pr-3">{b.tipo}</td>
                      <td className="py-1.5 pr-3">{b.direccion ?? "—"}</td>
                      <td className="cifra py-1.5 pr-3 text-xs">{b.referencia_catastral ?? "—"}</td>
                      <td className="cifra py-1.5 pr-3 text-right">{m2(b.m2_construidos)}</td>
                      <td className="cifra py-1.5 text-right">{pct(b.cuota_propiedad)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Bloque>

          {historico.length > 0 && (
            <Bloque titulo="Historial observado">
              <ol className="flex flex-col gap-2 text-sm">
                {historico.map((h, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-2">
                    <span className="cifra text-xs text-apagado">{fecha(h.momento)}</span>
                    <span>{h.estado ? ETIQUETA_ESTADO[h.estado as keyof typeof ETIQUETA_ESTADO] : "—"}</span>
                    {h.num_pujas != null && (
                      <span className="cifra text-xs text-apagado">
                        {h.num_pujas} {h.num_pujas === 1 ? "puja" : "pujas"}
                      </span>
                    )}
                    {h.puja_actual != null && (
                      <span className="cifra text-xs">{eur(h.puja_actual)}</span>
                    )}
                  </li>
                ))}
              </ol>
            </Bloque>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Bloque titulo="Datos de la subasta">
            <dl className="grid grid-cols-2 gap-3">
              <Dato titulo="Valor de salida">{eur(lote.valor_subasta)}</Dato>
              <Dato titulo="Tasación">{eur(lote.valor_tasacion)}</Dato>
              <Dato titulo="Puja mínima">{eur(lote.puja_minima)}</Dato>
              <Dato titulo="Depósito">{eur(lote.deposito)}</Dato>
              <Dato titulo="Publicada">{fecha(lote.fecha_publicacion)}</Dato>
              <Dato titulo="Cierra">{fecha(lote.fecha_fin)}</Dato>
            </dl>
            <dl className="mt-3 flex flex-col gap-3 border-t border-linea pt-3">
              <Dato titulo="Procedimiento">{lote.procedimiento ?? "—"}</Dato>
              <Dato titulo="Autoridad">{lote.autoridad ?? "—"}</Dato>
            </dl>
          </Bloque>

          <Bloque titulo="Valoración y localización">
            <dl className="grid grid-cols-2 gap-3">
              <Dato titulo="Superficie">{m2(lote.m2_construidos)}</Dato>
              <Dato titulo="Año">{lote.anio_construccion ?? "—"}</Dato>
              <Dato titulo="€/m² de salida">{eur(lote.eur_m2_salida)}</Dato>
              <Dato titulo="€/m² de zona">{eur(lote.precio_m2_zona)}</Dato>
              <Dato titulo="Valor estimado">{eur(lote.valor_estimado)}</Dato>
              <Dato titulo="Margen bruto">{pct(lote.margen_bruto)}</Dato>
            </dl>
            <p className="mt-3 text-xs text-apagado">
              Localización: {lote.precision_geo ? ETIQUETA_PRECISION[lote.precision_geo] : "sin determinar"}.
              {lote.confianza_valor != null && ` Confianza de la valoración: ${pct(lote.confianza_valor)}.`}
              {" "}La valoración es una estimación por zona, no una tasación.
            </p>
          </Bloque>
        </aside>
      </div>
    </main>
  );
}
