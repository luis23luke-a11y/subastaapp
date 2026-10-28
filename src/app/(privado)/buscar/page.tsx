import FilaLote from "@/components/FilaLote";
import Filtros, { ID_FORMULARIO } from "@/components/Filtros";
import Mapa from "@/components/Mapa";
import SelectAuto from "@/components/SelectAuto";
import { buscarLotes, provincias, puntosLotes } from "@/lib/consultas";
import { aQuerystring, leerFiltro, POR_PAGINA } from "@/lib/filtros";
import { entero } from "@/lib/formato";

export const dynamic = "force-dynamic";

const ORDENES = [
  ["cierre", "Cierran antes"],
  ["margen", "Más margen"],
  ["precio_asc", "Más baratos"],
  ["precio_desc", "Más caros"],
  ["nuevos", "Recién publicados"],
] as const;

export default async function Buscar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const crudo = await searchParams;
  const filtro = leerFiltro(crudo);

  const [resultado, puntos, provs] = await Promise.all([
    buscarLotes(filtro),
    puntosLotes(filtro),
    provincias(),
  ]);

  const enlacePagina = (pagina: number) => `/buscar?${aQuerystring({ ...filtro, pagina })}`;
  const desde = (filtro.pagina - 1) * POR_PAGINA + 1;
  const hasta = Math.min(filtro.pagina * POR_PAGINA, resultado.total);
  const hayFiltro = Boolean(filtro.q || filtro.provincia || filtro.tipo_bien?.length || filtro.precio_min != null
    || filtro.precio_max != null || filtro.m2_min != null || filtro.eur_m2_max != null || filtro.margen_min != null
    || filtro.situacion?.length || filtro.dias_max != null || filtro.sin_cargas || filtro.bbox);

  return (
    <div className="wrap cuerpo">
      <aside className="lateral" id="lateral" aria-label="Filtros">
        <Filtros filtro={filtro} />
      </aside>

      <main className="principal">
        <div className="mapa-caja">
          <Mapa puntos={puntos} bboxActual={filtro.bbox} />
        </div>

        <div className="filtros">
          <input type="search" name="q" form={ID_FORMULARIO} defaultValue={filtro.q ?? ""}
                 placeholder="Municipio, calle o referencia…" aria-label="Buscar" />
          <SelectAuto name="provincia" form={ID_FORMULARIO} defaultValue={filtro.provincia ?? ""} aria-label="Provincia">
            <option value="">Toda España</option>
            {provs.map((p) => (
              <option key={p.provincia} value={p.provincia}>{p.provincia} ({entero(p.n)})</option>
            ))}
          </SelectAuto>
          <label className="orden">
            Ordenar
            <SelectAuto name="orden" form={ID_FORMULARIO} defaultValue={filtro.orden} aria-label="Orden de la lista">
              {ORDENES.map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
            </SelectAuto>
          </label>
        </div>

        <p className="cuenta">
          {resultado.total === 0 ? "Ningún lote" : <>{entero(resultado.total)} {resultado.total === 1 ? "lote" : "lotes"}</>}
          {resultado.total > 0 && (
            <small>
              mostrando {desde}–{hasta}
              {filtro.bbox ? " · solo la zona del mapa" : ""}
              {filtro.provincia ? ` · ${filtro.provincia}` : ""}
            </small>
          )}
        </p>

        {resultado.total === 0 ? (
          <div className="vacio">
            <h3>Nada con estos filtros</h3>
            <p>Prueba a ensanchar el precio, quitar el margen mínimo o borrar la zona del mapa.</p>
            {hayFiltro && <p><a href="/buscar" className="btn">Quitar todos los filtros</a></p>}
          </div>
        ) : (
          <ol className="lista">
            {resultado.filas.map((lote) => <FilaLote key={lote.lote_id} lote={lote} />)}
          </ol>
        )}

        {resultado.paginas > 1 && (
          <nav className="paginas" aria-label="Páginas">
            {filtro.pagina > 1
              ? <a href={enlacePagina(filtro.pagina - 1)} className="btn small">‹ Anterior</a>
              : <span className="btn small" aria-disabled="true">‹ Anterior</span>}
            <span className="cifra">Página {filtro.pagina} de {entero(resultado.paginas)}</span>
            {filtro.pagina < resultado.paginas
              ? <a href={enlacePagina(filtro.pagina + 1)} className="btn small">Siguiente ›</a>
              : <span className="btn small" aria-disabled="true">Siguiente ›</span>}
          </nav>
        )}
      </main>
    </div>
  );
}
