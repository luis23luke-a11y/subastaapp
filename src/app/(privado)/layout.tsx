import Link from "next/link";
import { redirect } from "next/navigation";
import { cerrarSesion, usuarioActual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LayoutPrivado({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/login");

  async function salir() {
    "use server";
    await cerrarSesion();
    redirect("/login");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-linea bg-panel/90 backdrop-blur">
        <div className="mx-auto flex max-w-[110rem] items-center gap-4 px-4 py-3">
          <Link href="/buscar" className="text-sm font-medium">
            Subastas
          </Link>
          <span className="ml-auto text-xs text-apagado">{usuario.email}</span>
          <form action={salir}>
            <button className="text-xs text-apagado underline hover:text-texto">Salir</button>
          </form>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-linea px-4 py-4 text-center text-xs text-apagado">
        Datos orientativos procedentes de fuentes públicas. Consulta siempre el expediente
        original. No es asesoramiento jurídico ni fiscal.
      </footer>
    </div>
  );
}
