import { notFound } from "next/navigation";
import Cajon from "@/components/Cajon";
import FichaLote from "@/components/FichaLote";
import { bienesDelLote, historicoLote, lotePorId } from "@/lib/consultas";

export const dynamic = "force-dynamic";

// La ficha de un lote abierta desde el listado: la misma ficha que la pagina
// /lote/[id], pero en un cajon a la derecha, con el listado detras y botones
// de anterior y siguiente. La direccion sigue siendo /lote/[id], asi que se
// puede copiar y compartir; al recargarla se ve la pagina completa.

export default async function CajonLote({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lista?: string }>;
}) {
  const [{ id }, { lista }] = await Promise.all([params, searchParams]);
  const loteId = Number.parseInt(id, 10);
  if (!Number.isFinite(loteId)) notFound();

  const lote = await lotePorId(loteId);
  if (!lote) notFound();
  const [bienes, historico] = await Promise.all([bienesDelLote(loteId), historicoLote(loteId)]);

  const ids = (lista ?? "").split(",").map((s) => Number.parseInt(s, 10)).filter((n) => Number.isFinite(n));

  return (
    <Cajon actual={loteId} ids={ids}>
      <FichaLote lote={lote} bienes={bienes} historico={historico} />
    </Cajon>
  );
}
