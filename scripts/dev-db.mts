import "./env.mts";
/**
 * Local development Postgres without Docker: PGlite (Postgres compiled to WASM) behind a
 * wire-protocol socket so the app talks to it with the normal `pg` driver.
 * Production/staging use a managed PostgreSQL instance instead (see docs/DEPLOYMENT.md).
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { mkdirSync } from "node:fs";

const dataDir = process.env.PGLITE_DIR ?? ".data/pglite";
const port = Number(process.env.PGLITE_PORT ?? 5433);
mkdirSync(dataDir, { recursive: true });

const db = await PGlite.create({ dataDir, extensions: { btree_gist } });
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 20 });
await server.start();
console.log(`PGlite dev database listening on postgres://postgres:postgres@127.0.0.1:${port}/postgres (data: ${dataDir})`);

const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
