// Copia el worker de MapLibre a public/ para que el navegador pueda cargarlo.
//
// Desde la version 6, MapLibre solo se distribuye como modulo ES y arranca su
// worker en un fichero aparte, cuya URL calcula con import.meta.url. Bajo
// webpack (Next) esa URL apunta a un sitio que no existe: el navegador recibe
// la pagina 404 en vez de JavaScript, el worker no arranca y el mapa pinta las
// teselas pero ni un solo punto. Por eso se copia el fichero a public/mapa/ y
// Mapa.tsx le dice a MapLibre que lo cargue de ahi (setWorkerUrl).
//
// Se ejecuta solo antes de `npm run dev` y de `npm run build` (ganchos predev y
// prebuild), asi el fichero siempre corresponde a la version instalada. No se
// guarda en git.

import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const requerir = createRequire(import.meta.url);
const paquete = dirname(requerir.resolve("maplibre-gl/package.json"));
const origen = join(paquete, "dist", "maplibre-gl-worker.mjs");
const destino = join(process.cwd(), "public", "mapa", "maplibre-gl-worker.mjs");

mkdirSync(dirname(destino), { recursive: true });
copyFileSync(origen, destino);
console.info(`worker del mapa copiado a ${destino}`);
