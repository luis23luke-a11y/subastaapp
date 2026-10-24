import { NextResponse, type NextRequest } from "next/server";
import { canjearToken, COOKIE_SESION, opcionesCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(peticion: NextRequest) {
  const token = peticion.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/login?error=token", peticion.url));

  const sesion = await canjearToken(token);
  if (!sesion) return NextResponse.redirect(new URL("/login?error=token", peticion.url));

  const respuesta = NextResponse.redirect(new URL("/buscar", peticion.url));
  respuesta.cookies.set(COOKIE_SESION, sesion, opcionesCookie);
  return respuesta;
}
