"use client";

import { useEffect, useState } from "react";

// En pantalla estrecha el panel de filtros se esconde a la izquierda y este
// boton lo abre como un cajon (body.con-lateral, en globals.css). En pantalla
// ancha el boton no existe: el panel esta siempre a la vista.

export default function BotonFiltros() {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("con-lateral", abierto);
    if (!abierto) return;
    const cerrar = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("keydown", cerrar);
    return () => {
      window.removeEventListener("keydown", cerrar);
      document.body.classList.remove("con-lateral");
    };
  }, [abierto]);

  return (
    <>
      <button type="button" className="btn small solo-estrecho" onClick={() => setAbierto((v) => !v)}
              aria-expanded={abierto} aria-controls="lateral">
        Filtros
      </button>
      {abierto && (
        <button type="button" className="velo-lateral" aria-label="Cerrar los filtros"
                onClick={() => setAbierto(false)} />
      )}
    </>
  );
}
