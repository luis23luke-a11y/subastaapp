// Genera un enlace de acceso para un correo ya invitado, sin pasar por el
// correo electronico. Util en desarrollo y para dar de alta a alguien a mano.
//   npm run acceso -- --email=alguien@correo.es

import { crearTokenAcceso } from "@/lib/auth";
import { pool } from "@/lib/db";

async function principal() {
  const pref = "--email=";
  const email = process.argv.find((a) => a.startsWith(pref))?.slice(pref.length);
  if (!email) throw new Error("Falta --email=alguien@correo.es");

  const token = await crearTokenAcceso(email);
  if (!token) {
    throw new Error(
      `${email} no está en la lista de invitados. Dalo de alta con npm run db:semilla -- --email=...`,
    );
  }
  console.info(`${process.env.URL_BASE ?? "http://localhost:3000"}/acceso?token=${token}`);
  await pool.end();
}

principal().catch((err) => { console.error((err as Error).message); process.exit(1); });
