// Da de alta el primer usuario invitado y, si se pide, llena la base con los
// datos de muestra pasandolos por el worker de ingesta de verdad, no por un
// atajo: asi la siembra ejerce la misma ruta que usara la fuente real.
//
//   npm run db:semilla -- --email=tu@correo.es --lotes=240

import { AdaptadorMuestra } from "@/ingesta/adaptadores/muestra";
import { ejecutarWorker } from "@/ingesta/worker";
import { consultar, pool } from "@/lib/db";

function argumento(nombre: string, porDefecto?: string) {
  const pref = `--${nombre}=`;
  return process.argv.find((a) => a.startsWith(pref))?.slice(pref.length) ?? porDefecto;
}

async function principal() {
  const email = argumento("email");
  const cuantas = Number.parseInt(argumento("lotes", "240")!, 10);

  if (email) {
    await consultar(
      `insert into usuario (email, nombre) values ($1, $2)
       on conflict (email) do update set activo = true`,
      [email.toLowerCase(), argumento("nombre") ?? null],
    );
    console.info(`Usuario invitado: ${email}`);
  }

  if (cuantas > 0) {
    const r = await ejecutarWorker(new AdaptadorMuestra(cuantas), {
      presupuestoMs: 5 * 60_000,
      registrar: () => {},
    });
    console.info(`${r.procesadas} subastas de muestra sembradas (${r.nuevas} nuevas).`);
  }

  const filas = await consultar<{ lotes: number }>(`select count(*)::bigint as lotes from lote`);
  console.info(`Total de lotes en la base: ${filas[0]?.lotes ?? 0}`);
  await pool.end();
}

principal().catch((err) => { console.error(err); process.exit(1); });
