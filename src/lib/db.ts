import { Pool, types } from "pg";

// node-postgres devuelve numeric y bigint como texto para no perder precision.
// Aqui los importes caben de sobra en un double y los ids en un Number, asi que
// los convertimos una sola vez y el resto del codigo trabaja con numeros.
types.setTypeParser(1700, (v) => (v === null ? null : Number.parseFloat(v))); // numeric
types.setTypeParser(20, (v) => (v === null ? null : Number.parseInt(v, 10))); // int8

declare global {
  // eslint-disable-next-line no-var
  var __pool: Pool | undefined;
}

function crear(): Pool {
  const cadena = process.env.DATABASE_URL;
  if (!cadena) throw new Error("Falta DATABASE_URL. Copia .env.example a .env.");
  // En serverless cada instancia abre su propia pool y las instancias se
  // multiplican con el trafico: una pool grande agota el limite de conexiones
  // del servidor antes de que te des cuenta. Pocas conexiones por instancia y,
  // en produccion, una cadena de conexion con pooler (pgbouncer) delante.
  const enServerless = Boolean(process.env.VERCEL);
  return new Pool({
    connectionString: cadena,
    max: Number.parseInt(process.env.DB_MAX_CONEXIONES ?? (enServerless ? "2" : "8"), 10),
    idleTimeoutMillis: enServerless ? 10_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    // Supabase y la mayoria de gestionados exigen TLS; en local no.
    ssl: cadena.includes("localhost") || cadena.includes("127.0.0.1") || cadena.includes("/tmp")
      ? undefined
      : { rejectUnauthorized: false },
  });
}

/** Una sola pool por proceso, incluso con el recarga en caliente de Next. */
export const pool: Pool = global.__pool ?? crear();
if (process.env.NODE_ENV !== "production") global.__pool = pool;

export async function consultar<T>(sql: string, valores: unknown[] = []): Promise<T[]> {
  const res = await pool.query(sql, valores);
  return res.rows as T[];
}

export async function unaFila<T>(sql: string, valores: unknown[] = []): Promise<T | null> {
  const filas = await consultar<T>(sql, valores);
  return filas[0] ?? null;
}
