// CLI del worker de ingesta.
//
//   npm run ingesta                              una pasada con el adaptador de muestra
//   npm run ingesta -- --presupuesto=600         tope de 10 minutos
//   npm run ingesta -- --sin-descubrir           solo atiende lo que ya hay en cola
//   npm run ingesta -- --cola                    solo muestra el estado de la cola
//
// Pensado para correr desde un cron cada pocos minutos: cada pasada tiene tope
// de tiempo, lo que no le da tiempo a hacer se queda en la cola para la
// siguiente, y los trabajos a medias de un worker muerto se rescatan solos.

import { AdaptadorMuestra } from "@/ingesta/adaptadores/muestra";
import { ejecutarWorker, resumenCola } from "@/ingesta/worker";
import { pool } from "@/lib/db";
import type { Adaptador } from "@/ingesta/adaptador";

function argumento(nombre: string, porDefecto?: string): string | undefined {
  const pref = `--${nombre}=`;
  return process.argv.find((a) => a.startsWith(pref))?.slice(pref.length) ?? porDefecto;
}
const bandera = (nombre: string) => process.argv.includes(`--${nombre}`);

function elegirAdaptador(nombre: string, cuantas: number): Adaptador {
  switch (nombre) {
    case "muestra":
      return new AdaptadorMuestra(cuantas);
    default:
      throw new Error(
        `Adaptador desconocido: ${nombre}. Disponibles: muestra.\n` +
        `Los adaptadores de fuentes reales se añaden en src/ingesta/adaptadores/ ` +
        `implementando la interfaz de src/ingesta/adaptador.ts.`,
      );
  }
}

async function principal() {
  const nombre = argumento("adaptador", "muestra")!;
  const cuantas = Number.parseInt(argumento("cuantas", "240")!, 10);
  const presupuestoMs = Number.parseInt(argumento("presupuesto", "600")!, 10) * 1000;
  const desde = new Date(argumento("desde", "2021-01-01")!);

  const adaptador = elegirAdaptador(nombre, cuantas);

  if (bandera("cola")) {
    console.info(`Cola de "${adaptador.nombre}":`);
    console.info(await resumenCola(adaptador.nombre));
    await pool.end();
    return;
  }

  console.info(`Ingesta "${adaptador.nombre}", tope ${presupuestoMs / 1000}s`);
  const inicio = Date.now();
  const r = await ejecutarWorker(adaptador, {
    desde,
    presupuestoMs,
    descubrir: !bandera("sin-descubrir"),
  });

  console.info(
    `Hecho en ${((Date.now() - inicio) / 1000).toFixed(1)}s. ` +
    `${r.descubiertas} descubiertas, ${r.procesadas} procesadas ` +
    `(${r.nuevas} nuevas, ${r.actualizadas} actualizadas), ` +
    `${r.fallidas} fallos (${r.rendidas} rendidas), ${r.peticiones} peticiones.` +
    (r.agotadoElTiempo ? " Quedo trabajo en la cola para la siguiente pasada." : ""),
  );
  console.info(await resumenCola(adaptador.nombre));
  await pool.end();
}

principal().catch((err) => {
  console.error(err);
  process.exit(1);
});
