import Link from "next/link";
import { notFound } from "next/navigation";
import FichaLote from "@/components/FichaLote";
import { bienesDelLote, historicoLote, lotePorId } from "@/lib/consultas";

export const dynamic = "force-dynamic";

// La ficha como pagina completa: es lo que se ve al abrir un enlace a un lote
// directamente (desde una alerta, un correo, un marcador). Desde el listado la
// misma ficha se abre en un cajon (app/(privado)/@cajon).

export default async function PaginaLote({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loteId = Number.parseInt(id, 10);
  if (!Number.isFinite(loteId)) notFound();

  const lote = await lotePorId(loteId);
  if (!lote) notFound();
  const [bienes, historico] = await Promise.all([bienesDelLote(loteId), historicoLote(loteId)]);

  return (
    <main className="wrap" style={{ maxWidth: 860 }}>
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
