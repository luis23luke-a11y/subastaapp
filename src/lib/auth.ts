import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { consultar, unaFila } from "@/lib/db";

// Acceso por invitacion. No hay registro: solo entra quien esta en la tabla
// usuario, que da de alta el administrador a mano. El producto es cerrado y
// ademas los anuncios llevan datos personales, asi que nada de esto debe
// quedar abierto ni indexable.

export const COOKIE_SESION = "sub_sesion";
const DIAS_SESION = 30;
const MINUTOS_TOKEN = 20;

export interface Usuario {
  id: number;
  email: string;
  nombre: string | null;
}

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

/** Crea un token de un solo uso para un email que este en la lista blanca.
 *  Devuelve null si el email no esta invitado, sin decir por que: no se filtra
 *  quien es cliente y quien no. */
export async function crearTokenAcceso(email: string): Promise<string | null> {
  const usuario = await unaFila<{ id: number }>(
    `select id from usuario where email = $1 and activo`, [email.trim().toLowerCase()],
  );
  if (!usuario) return null;

  const token = randomBytes(32).toString("base64url");
  await consultar(
    `insert into token_acceso (token, usuario_id, expira)
     values ($1, $2, now() + make_interval(mins => $3))`,
    [hash(token), usuario.id, MINUTOS_TOKEN],
  );
  return token;
}

/** Canjea el token por una sesion. Marca el token como usado para que un
 *  enlace reenviado no valga dos veces. */
export async function canjearToken(token: string): Promise<string | null> {
  const fila = await unaFila<{ usuario_id: number }>(
    `update token_acceso set usado = now()
     where token = $1 and usado is null and expira > now()
     returning usuario_id`,
    [hash(token)],
  );
  if (!fila) return null;

  const idSesion = randomBytes(32).toString("base64url");
  await consultar(
    `insert into sesion (id, usuario_id, expira)
     values ($1, $2, now() + make_interval(days => $3))`,
    [hash(idSesion), fila.usuario_id, DIAS_SESION],
  );
  await consultar(`update usuario set ultimo_acceso = now() where id = $1`, [fila.usuario_id]);
  return idSesion;
}

export async function usuarioActual(): Promise<Usuario | null> {
  const galleta = (await cookies()).get(COOKIE_SESION)?.value;
  if (!galleta) return null;
  return unaFila<Usuario>(
    `select u.id, u.email, u.nombre
     from sesion s join usuario u on u.id = s.usuario_id
     where s.id = $1 and s.expira > now() and u.activo`,
    [hash(galleta)],
  );
}

export async function cerrarSesion(): Promise<void> {
  const tarro = await cookies();
  const galleta = tarro.get(COOKIE_SESION)?.value;
  if (galleta) await consultar(`delete from sesion where id = $1`, [hash(galleta)]);
  tarro.delete(COOKIE_SESION);
}

export const opcionesCookie = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: DIAS_SESION * 86_400,
};
