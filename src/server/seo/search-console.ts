import { createSign } from "node:crypto";
import type { Db } from "@/db";
import { searchMetrics } from "@/db/schema";

/**
 * Google Search Console import via a service account (added as a user on the property).
 * Stores daily page/query clicks & impressions — aggregate, no personal data.
 */
async function googleAccessToken(scope: string): Promise<string> {
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "{}") as { client_email?: string; private_key?: string };
  if (!sa.client_email || !sa.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  if (!res.ok) throw new Error(`google token ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function importSearchConsole(database: Db, days = 7) {
  const site = process.env.GOOGLE_SEARCH_CONSOLE_SITE;
  if (!site) throw new Error("GOOGLE_SEARCH_CONSOLE_SITE not configured");
  const token = await googleAccessToken("https://www.googleapis.com/auth/webmasters.readonly");
  const end = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
  const start = new Date(Date.now() - (days + 2) * 86400_000).toISOString().slice(0, 10);
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["date", "page", "query"], rowLimit: 5000 }),
  });
  if (!res.ok) throw new Error(`search console ${res.status}`);
  const body = (await res.json()) as { rows?: { keys: string[]; clicks: number; impressions: number; position: number }[] };
  for (const r of body.rows ?? []) {
    const [date, page, query] = r.keys;
    await database
      .insert(searchMetrics)
      .values({ date, page: page.replace(/^https?:\/\/[^/]+/, ""), query, clicks: r.clicks, impressions: r.impressions, position: r.position })
      .onConflictDoUpdate({ target: [searchMetrics.date, searchMetrics.page, searchMetrics.query], set: { clicks: r.clicks, impressions: r.impressions, position: r.position } });
  }
  return { rows: body.rows?.length ?? 0 };
}
