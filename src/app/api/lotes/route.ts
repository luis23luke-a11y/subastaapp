import { NextResponse, type NextRequest } from "next/server";
import { usuarioActual } from "@/lib/auth";
import { buscarLotes, puntosLotes } from "@/lib/consultas";
import { leerFiltro } from "@/lib/filtros";

export const dynamic = "force-dynamic";

// Misma busqueda que la pagina, en JSON. La usan el mapa cuando se mueve y,
// mas adelante, el motor de alertas: una alerta es un filtro guardado, asi que
// debe pasar exactamente por aqui.

export async function GET(peticion: NextRequest) {
  const usuario = await usuarioActual();
  if (!usuario) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const filtro = leerFiltro(peticion.nextUrl.searchParams);
  const soloPuntos = peticion.nextUrl.searchParams.get("formato") === "puntos";

  if (soloPuntos) {
    return NextResponse.json({ puntos: await puntosLotes(filtro) });
  }

  const resultado = await buscarLotes(filtro);
  return NextResponse.json(resultado);
}
