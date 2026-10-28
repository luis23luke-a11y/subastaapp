"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// El cajon que se abre por la derecha con la ficha de un lote, como la ficha
// de empresa en Maqro ES. Cerrar es volver atras en el historial, para que el
// listado conserve filtros, pagina y posicion del scroll. `ids` son los lotes
// de la pagina del listado desde la que se abrio: con ellos se puede ir al
// anterior y al siguiente sin cerrar.

export default function Cajon({
  actual, ids, children,
}: {
  actual: number;
  ids: number[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pos = ids.indexOf(actual);
  const anterior = pos > 0 ? ids[pos - 1] : undefined;
  const siguiente = pos >= 0 && pos < ids.length - 1 ? ids[pos + 1] : undefined;
  const lista = ids.join(",");

  const cerrar = () => {
    if (window.history.length > 1) router.back();
    else router.push("/buscar");
  };

  // Anterior y siguiente sustituyen la entrada del historial en vez de apilar
  // otra: asi "cerrar" (volver atras) lleva siempre al listado, no al lote
  // que se miro antes.
  useEffect(() => {
    document.body.classList.add("quieto");
    const teclas = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
      if (e.key === "ArrowLeft" && anterior != null) router.replace(`/lote/${anterior}?lista=${lista}`, { scroll: false });
      if (e.key === "ArrowRight" && siguiente != null) router.replace(`/lote/${siguiente}?lista=${lista}`, { scroll: false });
    };
    window.addEventListener("keydown", teclas);
    return () => {
      window.removeEventListener("keydown", teclas);
      document.body.classList.remove("quieto");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual, anterior, siguiente]);

  return (
    <>
      <button type="button" className="velo" aria-label="Cerrar la ficha" onClick={cerrar} />
      <aside className="cajon" role="dialog" aria-modal="true" aria-label="Ficha del lote">
        <div className="cajon-top">
          <button type="button" className="cajon-x" aria-label="Cerrar" onClick={cerrar}>×</button>
          <span className="cajon-pos">
            {pos >= 0 ? `${pos + 1} de ${ids.length}` : "Ficha del lote"}
          </span>
          <nav className="cajon-nav" aria-label="Lote anterior y siguiente">
            {anterior != null
              ? <Link className="btn small" href={`/lote/${anterior}?lista=${lista}`} replace scroll={false} aria-label="Lote anterior">‹</Link>
              : <span className="btn small" aria-disabled="true">‹</span>}
            {siguiente != null
              ? <Link className="btn small" href={`/lote/${siguiente}?lista=${lista}`} replace scroll={false} aria-label="Lote siguiente">›</Link>
              : <span className="btn small" aria-disabled="true">›</span>}
          </nav>
        </div>
        <div className="cajon-cuerpo">{children}</div>
      </aside>
    </>
  );
}
