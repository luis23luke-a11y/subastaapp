// Aplica en orden los ficheros .sql de db/. Son idempotentes, asi que volver a
// ejecutarlo no rompe nada.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "@/lib/db";

async function principal() {
  const dir = join(process.cwd(), "db");
  const ficheros = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of ficheros) {
    process.stdout.write(`  ${f} ... `);
    await pool.query(readFileSync(join(dir, f), "utf8"));
    console.info("ok");
  }
  console.info(`${ficheros.length} migraciones aplicadas.`);
  await pool.end();
}

principal().catch((err) => { console.error(err); process.exit(1); });
