import { existsSync } from "node:fs";
// Local convenience: load .env.local when present (production injects real env vars).
for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);
