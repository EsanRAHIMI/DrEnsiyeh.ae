import { avg, desc, eq, isNull, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { editorialTasks, searchMetrics, seoIssues, webVitals } from "@/db/schema";
import { requireStaff } from "@/server/auth/session";
import { PageTitle, Section, Stat, Table } from "@/components/admin/ui";
import { fmtDate } from "@/lib/format";
import { SERVICE_AREAS } from "@/content/service-areas";

const P75 = (name: string) => sql<number>`percentile_cont(0.75) within group (order by ${webVitals.value}) filter (where ${webVitals.name} = ${name})`;

export default async function Seo() {
  await requireStaff("analytics:read");
  const [issues, tasks, pages, queries, vitals] = await Promise.all([
    db().select().from(seoIssues).where(isNull(seoIssues.resolvedAt)).orderBy(desc(seoIssues.severity), seoIssues.url).limit(200),
    db().select().from(editorialTasks).where(eq(editorialTasks.status, "open")).orderBy(editorialTasks.dueAt),
    db().select({ page: searchMetrics.page, clicks: sum(searchMetrics.clicks), impressions: sum(searchMetrics.impressions), pos: avg(searchMetrics.position) }).from(searchMetrics).groupBy(searchMetrics.page).orderBy(desc(sum(searchMetrics.clicks))).limit(20),
    db().select({ query: searchMetrics.query, clicks: sum(searchMetrics.clicks), impressions: sum(searchMetrics.impressions) }).from(searchMetrics).where(sql`${searchMetrics.query} <> ''`).groupBy(searchMetrics.query).orderBy(desc(sum(searchMetrics.impressions))).limit(20),
    db().select({ lcp: P75("LCP"), inp: P75("INP"), cls: P75("CLS"), n: sql<number>`count(*)::int` }).from(webVitals).where(sql`${webVitals.createdAt} > now() - interval '28 days'`),
  ]);
  const v = vitals[0];
  const pending = SERVICE_AREAS.filter((a) => !a.medicallyReviewedAt);
  // Content gaps: high-impression queries whose landing page has low CTR.
  const gaps = queries.filter((q) => Number(q.impressions) > 50 && Number(q.clicks) / Number(q.impressions) < 0.01);
  return (
    <div>
      <PageTitle title="SEO operations" subtitle="Automated technical audit (daily crawl), Search Console performance, real-user Core Web Vitals and editorial tasks. Medical copy is never changed automatically." />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Open issues" value={issues.length} hint={`${issues.filter((i) => i.severity === "error").length} errors`} />
        <Stat label="LCP p75" value={v?.lcp ? `${(v.lcp / 1000).toFixed(2)} s` : "—"} hint="target ≤ 2.5 s" />
        <Stat label="INP p75" value={v?.inp ? `${Math.round(v.inp)} ms` : "—"} hint="target ≤ 200 ms" />
        <Stat label="CLS p75" value={v?.cls != null ? v.cls.toFixed(3) : "—"} hint={`target ≤ 0.1 · ${v?.n ?? 0} samples`} />
      </div>
      {pending.length > 0 && (
        <Section title="Service pages awaiting medical review (not indexed)">
          <ul className="list-disc ps-6 text-sm text-ink-soft">{pending.map((p) => <li key={p.slug}>{p.title}</li>)}</ul>
        </Section>
      )}
      <Section title="Editorial tasks">
        <Table head={["Task", "Type", "Due"]} empty={tasks.length === 0}>
          {tasks.map((t) => <tr key={t.id}><td className="p-3">{t.title}</td><td className="p-3">{t.type}</td><td className="p-3">{t.dueAt ? fmtDate(t.dueAt) : "—"}</td></tr>)}
        </Table>
      </Section>
      <Section title="Technical issues">
        <Table head={["Severity", "URL", "Issue", "Detail", "Since"]} empty={issues.length === 0}>
          {issues.map((i) => (
            <tr key={i.id}><td className={`p-3 ${i.severity === "error" ? "text-alert" : i.severity === "warning" ? "text-brass" : "text-muted"}`}>{i.severity}</td><td className="p-3 font-mono text-xs">{i.url}</td><td className="p-3">{i.type.replace(/_/g, " ")}</td><td className="p-3 text-xs">{i.detail}</td><td className="p-3">{fmtDate(i.firstSeenAt)}</td></tr>
          ))}
        </Table>
      </Section>
      <Section title="Top organic landing pages">
        <Table head={["Page", "Clicks", "Impressions", "CTR", "Avg. position"]} empty={pages.length === 0}>
          {pages.map((p) => <tr key={p.page}><td className="p-3 font-mono text-xs">{p.page}</td><td className="p-3">{p.clicks}</td><td className="p-3">{p.impressions}</td><td className="p-3">{Number(p.impressions) ? ((Number(p.clicks) / Number(p.impressions)) * 100).toFixed(1) : 0}%</td><td className="p-3">{Number(p.pos ?? 0).toFixed(1)}</td></tr>)}
        </Table>
      </Section>
      <Section title="Search queries">
        <Table head={["Query", "Impressions", "Clicks"]} empty={queries.length === 0}>
          {queries.map((q) => <tr key={q.query}><td className="p-3">{q.query}</td><td className="p-3">{q.impressions}</td><td className="p-3">{q.clicks}</td></tr>)}
        </Table>
      </Section>
      {gaps.length > 0 && (
        <Section title="Content opportunities (draft briefs for editorial review)">
          <ul className="space-y-2 text-sm">{gaps.map((g) => <li key={g.query} className="card p-3"><strong>{g.query}</strong> — {g.impressions} impressions, CTR under 1%. Brief: answer this question concisely near the top of the most relevant page, cite an authoritative source, and have the doctor review.</li>)}</ul>
        </Section>
      )}
    </div>
  );
}
