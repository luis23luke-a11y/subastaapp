import Link from "next/link";
import { notFound } from "next/navigation";
import FichaLote from "@/components/FichaLote";
import { bienesDelLote, historicoLote, lotePorId } from "@/lib/consultas";

export const dynamic = "force-dynamic";

// La pantalla de un lote: todo lo que se sabe de el, con el mapa de donde
// esta. Se llega desde el listado o desde un enlace directo (una alerta, un
// correo, un marcador): es la misma pagina en los dos casos.

export default async function PaginaLote({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loteId = Number.parseInt(id, 10);
  if (!Number.isFinite(loteId)) notFound();

  const lote = await lotePorId(loteId);
  if (!lote) notFound();
  const [bienes, historico] = await Promise.all([bienesDelLote(loteId), historicoLote(loteId)]);

  return (
    <main className="wrap" style={{ maxWidth: 920 }}>
      <p style={{ margin: "20px 0 0" }}>
        <Link href="/buscar" className="btn small">‹ Volver al buscador</Link>
      </p>
      <div className="panel" style={{ marginBlock: 16 }}>
        <div className="panel-in">
          <FichaLote lote={lote} bienes={bienes} historico={historico} />
        </div>
      </div>
    </main>
  );
}
