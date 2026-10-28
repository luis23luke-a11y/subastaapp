import Link from "next/link";
import { redirect } from "next/navigation";
import BotonFiltros from "@/components/BotonFiltros";
import Marca from "@/components/Marca";
import { cerrarSesion, usuarioActual } from "@/lib/auth";
import { resumenCabecera } from "@/lib/consultas";
import { entero, hace } from "@/lib/formato";

export const dynamic = "force-dynamic";

// La puerta de acceso y el marco comun: cabecera fija translucida con la
// marca, una linea de estado que dice cuantos lotes hay y de cuando son, y
// el pie. `cajon` es la ranura donde se abre la ficha de un lote por encima
// del listado (app/(privado)/@cajon).

export default async function LayoutPrivado({
  children, cajon,
}: {
  children: React.ReactNode;
  cajon: React.ReactNode;
}) {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/login");
  const resumen = await resumenCabecera();

  async function salir() {
    "use server";
    await cerrarSesion();
    redirect("/login");
  }

  return (
    <>
      <header className="top">
        <div className="wrap">
          <Link href="/buscar" className="brand">
            <Marca />
            <span className="brand-txt">
              Subastas
              <small>Inmuebles del Portal de Subastas del BOE</small>
            </span>
          </Link>
          <p className="state">
            <b>{entero(resumen.lotes)}</b> lotes a la vista{" "}
            <span className="desde">· actualizado {hace(resumen.actualizado)}</span>
          </p>
          <div className="top-acc">
            <BotonFiltros />
            <span className="top-correo" title={usuario.email}>{usuario.email}</span>
            <form action={salir}>
              <button className="btn small">Salir</button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>
      {cajon}

      <footer className="foot">
        <div className="wrap">
          <p>
            Datos orientativos procedentes de fuentes públicas. Consulta siempre el expediente
            original en el portal antes de pujar. No es asesoramiento jurídico ni fiscal.
          </p>
          <p className="cita">
            Basado en datos de la{" "}
            <a href="https://www.boe.es" target="_blank" rel="noreferrer">
              Agencia Estatal Boletín Oficial del Estado
            </a>.
          </p>
        </div>
      </footer>
    </>
  );
}
