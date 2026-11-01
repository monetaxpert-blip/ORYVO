import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { activities } from "./schema";

/**
 * La base est résolue paresseusement au premier usage réel (requête HTTP),
 * jamais au moment de l'import : le build de production ne peut donc pas
 * échouer à cause d'un DATABASE_URL manquant, et le message d'erreur
 * pointe directement vers le réglage à corriger.
 */
function makeDb(pool: Pool) {
  return drizzle(pool, { schema: { activities } });
}
type Db = ReturnType<typeof makeDb>;

const MISSING_DB_ERROR =
  "DATABASE_URL manquant. En local : copier .env.example vers .env. " +
  "Sur Vercel : Settings → Environment Variables → DATABASE_URL (chaîne de connexion Postgres).";

function resolve(): { pool: Pool; db: Db } {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(MISSING_DB_ERROR);
  return { pool: new Pool({ connectionString: url }), db: makeDb(new Pool({ connectionString: url })) };
}

const globalForDb = globalThis as typeof globalThis & {
  __oryvoDb?: { pool: Pool; db: Db };
};

function shared(): { pool: Pool; db: Db } {
  if (!globalForDb.__oryvoDb) {
    globalForDb.__oryvoDb = resolve();
  }
  return globalForDb.__oryvoDb;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const { db: real } = shared();
    const value = Reflect.get(real, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const { pool: real } = shared();
    return Reflect.get(real, prop);
  },
});
