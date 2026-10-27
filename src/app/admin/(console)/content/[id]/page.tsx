import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { articleCategories, articleRevisions, articles } from "@/db/schema";
import { requireStaff } from "@/server/auth/session";
import { can } from "@/lib/rbac";
import { PageTitle, Section } from "@/components/admin/ui";
import { ArticleEditor } from "@/components/admin/ArticleEditor";
import { ActionForm } from "@/components/admin/ActionForm";
import { workflow } from "../actions";
import { pickLocalized } from "@/i18n/dictionaries";
import { fmtDateTime } from "@/lib/format";
import { suggestInternalLinks } from "@/server/seo/suggestions";

export default async function EditArticle({ params }: PageProps<"/admin/content/[id]">) {
  const user = await requireStaff("content:edit");
  const { id } = await params;
  const [a] = await db().select().from(articles).where(eq(articles.id, id));
  if (!a) notFound();
  const [cats, revs, links] = await Promise.all([
    db().select().from(articleCategories),
    db().select({ revision: articleRevisions.revision, note: articleRevisions.note, createdAt: articleRevisions.createdAt }).from(articleRevisions).where(eq(articleRevisions.articleId, id)).orderBy(desc(articleRevisions.revision)).limit(20),
    suggestInternalLinks(db(), a),
  ]);
  const approvedCurrent = a.approvedRevision === a.revision;
  const wf = (op: string, label: string, tone: "primary" | "secondary" | "danger" = "secondary", extra?: React.ReactNode) => (
    <ActionForm action={workflow} submit={label} tone={tone} okText="Done">
      <input type="hidden" name="id" value={a.id} /><input type="hidden" name="op" value={op} />
      {extra}
    </ActionForm>
  );
  return (
    <div>
      <Link href="/admin/content" className="text-sm text-teal">← Articles</Link>
      <PageTitle title={a.title} subtitle={`Status: ${a.status.replace("_", " ")} · revision ${a.revision}${a.approvedRevision ? ` · approved revision ${a.approvedRevision}` : ""}`}>
        {a.status === "published" && <a href={`/${a.locale}/articles/${a.slug}`} target="_blank" className="btn-secondary min-h-10 text-sm">View live</a>}
        <a href={`/admin/content/${a.id}/preview`} target="_blank" className="btn-secondary min-h-10 text-sm">Preview this revision</a>
      </PageTitle>

      <div className="mb-6 flex flex-wrap gap-4 rounded-2xl border border-line bg-white p-4">
        {["draft", "changes_requested"].includes(a.status) && wf("submit", "Submit for medical review", "primary")}
        {a.status === "published" && !approvedCurrent && wf("submit", "Submit edits for medical review", "primary")}
        {can(user.roles, "content:medical_approve") && a.status === "in_review" && (
          <>
            {wf("approve", "Medically approve this revision", "primary", <label className="text-xs text-muted">Next review in (months)<input name="reviewMonths" type="number" min="1" max="36" defaultValue={12} className="field mt-1 w-28" /></label>)}
            {wf("request_changes", "Request changes", "secondary", <input name="note" className="field" placeholder="What needs to change?" />)}
          </>
        )}
        {can(user.roles, "content:publish") && approvedCurrent && a.status !== "published" && (
          <>
            {wf("publish", "Publish now", "primary")}
            {wf("schedule", "Schedule", "secondary", <input type="datetime-local" name="scheduledFor" className="field" aria-label="Publish at (Dubai time)" required />)}
          </>
        )}
        {can(user.roles, "content:publish") && approvedCurrent && a.status === "published" && a.updatedAt > (a.medicallyReviewedAt ?? a.updatedAt) && wf("publish", "Publish approved revision", "primary")}
        {can(user.roles, "content:publish") && a.status === "published" && wf("unpublish", "Unpublish", "danger")}
      </div>

      <ArticleEditor
        categories={cats.map((c) => ({ id: c.id, name: pickLocalized(c.name, "en") }))}
        initial={{
          id: a.id,
          title: a.title,
          slug: a.slug,
          excerpt: a.excerpt,
          blocks: a.blocks as never,
          references: a.references as never,
          categoryId: a.categoryId,
          tags: a.tags,
          seoTitle: a.seoTitle,
          seoDescription: a.seoDescription,
          canonicalUrl: a.canonicalUrl,
          heroImageUrl: a.heroImageUrl,
          heroImageAlt: a.heroImageAlt,
        }}
      />

      {links.length > 0 && (
        <Section title="Suggested internal links">
          <ul className="space-y-1 text-sm">{links.map((l) => <li key={l.href}><code className="rounded bg-sage px-1.5">[{l.anchor}]({l.href})</code> <span className="text-muted">— {l.reason}</span></li>)}</ul>
        </Section>
      )}
      <Section title="Revision history">
        <ul className="space-y-1 text-sm text-ink-soft">{revs.map((r) => <li key={r.revision}>Rev {r.revision} · {r.note} · {fmtDateTime(r.createdAt)}{r.revision === a.approvedRevision ? " · medically approved" : ""}</li>)}</ul>
      </Section>
    </div>
  );
}
