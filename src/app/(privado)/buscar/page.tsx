import Filtros from "@/components/Filtros";
import Mapa from "@/components/Mapa";
import TarjetaLote from "@/components/TarjetaLote";
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

  const enlaceOrden = (orden: string) =>
    `/buscar?${aQuerystring({ ...filtro, orden: orden as never, pagina: 1 })}`;
  const enlacePagina = (pagina: number) =>
    `/buscar?${aQuerystring({ ...filtro, pagina })}`;

  const desde = (filtro.pagina - 1) * POR_PAGINA + 1;
  const hasta = Math.min(filtro.pagina * POR_PAGINA, resultado.total);

  return (
    <main className="mx-auto grid max-w-[110rem] gap-4 px-4 py-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="h-fit rounded-xl border border-linea bg-panel p-4 lg:sticky lg:top-16">
        <Filtros filtro={filtro} provincias={provs} />
      </aside>

      <section className="flex min-w-0 flex-col gap-4">
        <div className="h-[22rem] shrink-0">
          <Mapa puntos={puntos} bboxActual={filtro.bbox} />
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm">
            {resultado.total === 0 ? (
              "Ningún lote con estos filtros"
            ) : (
              <>
                <span className="cifra font-medium">{entero(resultado.total)}</span>{" "}
                {resultado.total === 1 ? "lote" : "lotes"}
                <span className="text-apagado">
                  {" "}· mostrando {desde}–{hasta}
                </span>
              </>
            )}
          </p>
          <nav className="flex flex-wrap gap-1 text-xs">
            {ORDENES.map(([valor, texto]) => (
              <a
                key={valor}
                href={enlaceOrden(valor)}
                className={`rounded-full border px-2.5 py-1 ${
                  filtro.orden === valor
                    ? "border-acento bg-acento text-white"
                    : "border-linea text-apagado hover:text-texto"
                }`}
              >
                {texto}
              </a>
            ))}
          </nav>
        </div>

        {resultado.total === 0 ? (
          <div className="rounded-xl border border-dashed border-linea p-8 text-center text-sm text-apagado">
            <p>Prueba a ensanchar el precio, quitar el filtro de margen o borrar la zona del mapa.</p>
            <p className="mt-2">
              Si la base está vacía, siembra los datos de muestra con{" "}
              <code className="rounded bg-fondo px-1">npm run db:semilla</code>.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {resultado.filas.map((lote) => (
              <li key={lote.lote_id} className="contents">
                <TarjetaLote lote={lote} />
              </li>
            ))}
          </ul>
        )}

        {resultado.paginas > 1 && (
          <nav className="flex items-center justify-center gap-3 py-2 text-sm">
            {filtro.pagina > 1 && (
              <a href={enlacePagina(filtro.pagina - 1)} className="text-acento underline">Anterior</a>
            )}
            <span className="cifra text-apagado">
              Página {filtro.pagina} de {resultado.paginas}
            </span>
            {filtro.pagina < resultado.paginas && (
              <a href={enlacePagina(filtro.pagina + 1)} className="text-acento underline">Siguiente</a>
            )}
          </nav>
        )}
      </section>
    </main>
  );
}
