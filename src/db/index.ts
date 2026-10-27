import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "./schema";

export { schema };

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __drDb?: Db; __drPool?: Pool };

/** Process-wide database handle. Tests inject their own via setDb(). */
export function db(): Db {
  if (!globalForDb.__drDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: true } : undefined,
    });
    globalForDb.__drPool = pool;
    globalForDb.__drDb = drizzle(pool, { schema }) as unknown as Db;
  }
  return globalForDb.__drDb;
}

export function setDb(instance: Db) {
  globalForDb.__drDb = instance;
}
