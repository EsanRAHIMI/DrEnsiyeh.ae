import "./env.mts";
/**
 * Long-running job runner for single-server deployments (or local development).
 * Calls the same idempotent jobs the cron endpoint exposes, on fixed intervals.
 */
const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("CRON_SECRET is required");

const schedule: [string, number][] = [
  ["holds", 60_000],
  ["notifications", 15_000],
  ["calendar", 5 * 60_000],
  ["reconcile", 10 * 60_000],
  ["content", 15 * 60_000],
];

async function run(job: string) {
  try {
    const res = await fetch(`${base}/api/v1/cron/${job}`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
    const body = await res.json();
    if (!res.ok || JSON.stringify(body.result ?? {}).match(/[1-9]/)) console.log(new Date().toISOString(), job, res.status, JSON.stringify(body));
  } catch (e) {
    console.error(new Date().toISOString(), job, "unreachable", e instanceof Error ? e.message : e);
  }
}

for (const [job, every] of schedule) {
  void run(job);
  setInterval(() => void run(job), every);
}
console.log(`Worker running against ${base}`);
