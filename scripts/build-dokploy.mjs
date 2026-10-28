/**
 * Build against an empty, disposable PostgreSQL engine, never the live database.
 * ISR pages refresh from the real database after deployment. No demo data is seeded.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

const directory = await mkdtemp(join(tmpdir(), "drensiyeh-build-"));
const env = {
  ...process.env,
  DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5433/postgres",
  DATABASE_SSL: "",
  PGLITE_DIR: directory,
  PGLITE_PORT: "5433",
};
const database = spawn(process.execPath, ["--import", "tsx", "scripts/dev-db.mts"], {
  env,
  stdio: "inherit",
});
const databaseExited = new Promise(resolve => database.once("exit", resolve));
const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { env, stdio: "inherit" });
  child.once("error", reject);
  child.once("exit", code => code === 0 ? resolve() : reject(new Error(command + " exited " + code)));
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (database.exitCode !== null) throw new Error("Build database exited before becoming ready");
    const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 1000 });
    try {
      await client.connect();
      await client.query("select 1");
      ready = true;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 1000));
    } finally {
      await client.end().catch(() => {});
    }
    if (ready) break;
  }
  if (!ready) throw new Error("Build database did not become ready");
  await run("npm", ["run", "db:migrate"]);
  await run("npm", ["run", "build"]);
} finally {
  database.kill("SIGTERM");
  await databaseExited;
  await rm(directory, { recursive: true, force: true });
}
