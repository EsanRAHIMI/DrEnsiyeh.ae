import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { seoIssues, editorialTasks } from "@/db/schema";

export type Issue = { url: string; type: string; severity: "info" | "warning" | "error"; detail: string };

type Fetcher = typeof fetch;

/** Extracts the few things we audit from HTML without a DOM dependency. */
export function inspectHtml(url: string, html: string, status: number): { issues: Issue[]; links: string[]; title: string | null; description: string | null } {
  const issues: Issue[] = [];
  const pick = (re: RegExp) => html.match(re)?.[1]?.trim() ?? null;
  const title = pick(/<title[^>]*>([^<]*)<\/title>/i);
  const description = pick(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i);
  const canonical = pick(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i);
  const robots = pick(/<meta[^>]+name="robots"[^>]+content="([^"]*)"/i);
  const h1s = html.match(/<h1[\s>]/gi)?.length ?? 0;
  if (status >= 400) issues.push({ url, type: "http_error", severity: "error", detail: `HTTP ${status}` });
  if (!title) issues.push({ url, type: "missing_title", severity: "error", detail: "No <title>" });
  else if (title.length > 65) issues.push({ url, type: "long_title", severity: "warning", detail: `${title.length} chars` });
  if (!description) issues.push({ url, type: "missing_description", severity: "warning", detail: "No meta description" });
  if (!canonical) issues.push({ url, type: "missing_canonical", severity: "warning", detail: "No canonical link" });
  if (h1s !== 1) issues.push({ url, type: "h1_count", severity: "warning", detail: `${h1s} <h1> elements` });
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const noAlt = imgs.filter((i) => !/\balt="[^"]+"/i.test(i) && !/aria-hidden="true"/i.test(i));
  if (noAlt.length) issues.push({ url, type: "missing_alt", severity: "warning", detail: `${noAlt.length} image(s) without alt text` });
  if (robots?.includes("noindex")) issues.push({ url, type: "noindex", severity: "info", detail: robots });
  const links = [...html.matchAll(/<a\b[^>]*href="([^"#]+)"/gi)].map((m) => m[1]);
  return { issues, links, title, description };
}

/**
 * Crawls the public site from the sitemap + internal links (same origin, public paths only),
 * records issues, detects duplicate titles/descriptions and broken internal links.
 */
export async function crawlSite(database: Db, origin: string, opts: { max?: number; fetcher?: Fetcher } = {}) {
  const f = opts.fetcher ?? fetch;
  const max = opts.max ?? 300;
  const queue: string[] = [`${origin}/en`];
  try {
    const sm = await (await f(`${origin}/sitemap.xml`)).text();
    queue.push(...[...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, origin)));
  } catch {
    /* sitemap optional */
  }
  const seen = new Set<string>();
  const all: Issue[] = [];
  const titles = new Map<string, string[]>();
  const descs = new Map<string, string[]>();
  while (queue.length && seen.size < max) {
    const url = queue.shift()!.split("?")[0];
    if (seen.has(url)) continue;
    seen.add(url);
    let res: Response;
    try {
      res = await f(url, { redirect: "manual", headers: { "User-Agent": "DrEnsiyeh-SEO-Audit/1.0" } });
    } catch {
      all.push({ url, type: "unreachable", severity: "error", detail: "Request failed" });
      continue;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (loc) queue.push(new URL(loc, url).toString());
      continue;
    }
    if (!(res.headers.get("content-type") ?? "").includes("text/html")) continue;
    const { issues, links, title, description } = inspectHtml(url, await res.text(), res.status);
    all.push(...issues);
    if (title) titles.set(title, [...(titles.get(title) ?? []), url]);
    if (description) descs.set(description, [...(descs.get(description) ?? []), url]);
    for (const l of links) {
      const abs = new URL(l, url);
      if (abs.origin !== origin) continue;
      if (/^\/(admin|api)|\/(portal|login|book\/status)/.test(abs.pathname)) continue;
      queue.push(abs.toString());
    }
  }
  for (const [t, urls] of titles) if (urls.length > 1) for (const u of urls) all.push({ url: u, type: "duplicate_title", severity: "warning", detail: `“${t.slice(0, 60)}” on ${urls.length} pages` });
  for (const [, urls] of descs) if (urls.length > 1) for (const u of urls) all.push({ url: u, type: "duplicate_description", severity: "info", detail: `Shared with ${urls.length - 1} other page(s)` });

  // Upsert current issues; mark issues not seen this run as resolved.
  const now = new Date();
  for (const i of all) {
    const path = i.url.replace(origin, "");
    await database
      .insert(seoIssues)
      .values({ url: path, type: i.type, severity: i.severity, detail: i.detail, firstSeenAt: now, lastSeenAt: now })
      .onConflictDoUpdate({ target: [seoIssues.url, seoIssues.type], set: { severity: i.severity, detail: i.detail, lastSeenAt: now, resolvedAt: null } });
  }
  const keys = all.map((i) => `${i.url.replace(origin, "")}|${i.type}`);
  await database
    .update(seoIssues)
    .set({ resolvedAt: now })
    .where(and(isNull(seoIssues.resolvedAt), keys.length ? notInArray(sql`${seoIssues.url} || '|' || ${seoIssues.type}`, keys) : sql`true`));
  // Missing metadata on articles becomes an editorial task (humans fix copy; nothing auto-published).
  for (const i of all.filter((x) => x.type === "missing_description" && x.url.includes("/articles/"))) {
    const title = `Add meta description: ${i.url.replace(origin, "")}`;
    const [exists] = await database.select().from(editorialTasks).where(and(eq(editorialTasks.title, title), eq(editorialTasks.status, "open")));
    if (!exists) await database.insert(editorialTasks).values({ type: "metadata_fix", title });
  }
  return { pages: seen.size, issues: all.length };
}
