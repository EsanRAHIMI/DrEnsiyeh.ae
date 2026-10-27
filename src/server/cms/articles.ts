import { and, desc, eq, max } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "@/db";
import { articleRevisions, articles, editorialTasks, redirects } from "@/db/schema";
import { audit, type Actor } from "@/server/audit";
import { can, type Role } from "@/lib/rbac";
import { blocksSchema, referenceSchema, slugify, plainText, type Block } from "./blocks";

export class CmsError extends Error {}

type StaffActor = Actor & { roles: Role[]; name: string };

export type ArticleInput = {
  title: string;
  slug?: string;
  excerpt?: string | null;
  blocks: unknown;
  references: unknown;
  categoryId?: string | null;
  tags?: string[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  heroImageUrl?: string | null;
  heroImageAlt?: string | null;
  locale?: string;
};

function validate(input: ArticleInput) {
  const blocks = blocksSchema.parse(input.blocks) as Block[];
  const references = referenceSchema.parse(input.references ?? []);
  if (input.heroImageUrl && !input.heroImageAlt) throw new CmsError("Hero image needs alt text");
  return { blocks, references };
}

export async function createArticle(database: Db, actor: StaffActor, input: ArticleInput) {
  if (!can(actor.roles, "content:edit")) throw new CmsError("forbidden");
  const { blocks, references } = validate(input);
  const [a] = await database
    .insert(articles)
    .values({
      translationGroupId: randomUUID(),
      locale: input.locale ?? "en",
      slug: input.slug ? slugify(input.slug) : slugify(input.title),
      title: input.title,
      excerpt: input.excerpt ?? null,
      blocks,
      references,
      categoryId: input.categoryId ?? null,
      tags: input.tags ?? [],
      authorUserId: actor.userId,
      authorName: actor.name,
    })
    .returning();
  await snapshot(database, a.id, actor, "created");
  await audit(database, actor, "article.create", "article", a.id);
  return a;
}

async function snapshot(database: Db, id: string, actor: Actor, note: string) {
  const [a] = await database.select().from(articles).where(eq(articles.id, id));
  await database.insert(articleRevisions).values({ articleId: id, revision: a.revision, snapshot: a, editorUserId: actor.userId, note }).onConflictDoNothing();
}

/**
 * Any edit creates a new revision. Editing an approved or published article invalidates the
 * medical approval (approvedRevision no longer matches) — it must be re-reviewed before the
 * new text goes live; the previously approved text stays live in the meantime.
 */
export async function updateArticle(database: Db, actor: StaffActor, id: string, input: ArticleInput) {
  if (!can(actor.roles, "content:edit")) throw new CmsError("forbidden");
  const { blocks, references } = validate(input);
  const [cur] = await database.select().from(articles).where(eq(articles.id, id));
  if (!cur) throw new CmsError("not found");
  const newSlug = input.slug ? slugify(input.slug) : cur.slug;
  const live = cur.status === "published";
  const [a] = await database
    .update(articles)
    .set({
      title: input.title,
      slug: newSlug,
      excerpt: input.excerpt ?? null,
      blocks,
      references,
      categoryId: input.categoryId ?? null,
      tags: input.tags ?? [],
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      canonicalUrl: input.canonicalUrl ?? null,
      heroImageUrl: input.heroImageUrl ?? null,
      heroImageAlt: input.heroImageAlt ?? null,
      revision: cur.revision + 1,
      status: live ? "published" : cur.status === "approved" || cur.status === "scheduled" ? "draft" : cur.status,
      updatedAt: new Date(),
    })
    .where(and(eq(articles.id, id), eq(articles.revision, cur.revision)))
    .returning();
  if (!a) throw new CmsError("Someone else saved this article — reload to see their changes");
  if (newSlug !== cur.slug && cur.publishedAt) {
    await database.insert(redirects).values({ fromPath: `/${cur.locale}/articles/${cur.slug}`, toPath: `/${cur.locale}/articles/${newSlug}` }).onConflictDoNothing();
  }
  await snapshot(database, id, actor, "edited");
  return a;
}

export async function transitionArticle(
  database: Db,
  actor: StaffActor,
  id: string,
  op: "submit" | "approve" | "request_changes" | "publish" | "schedule" | "unpublish",
  opts: { scheduledFor?: Date; note?: string; reviewMonths?: number } = {},
) {
  const [a] = await database.select().from(articles).where(eq(articles.id, id));
  if (!a) throw new CmsError("not found");
  const now = new Date();
  const set: Partial<typeof articles.$inferInsert> = { updatedAt: now };
  switch (op) {
    case "submit":
      if (!can(actor.roles, "content:edit")) throw new CmsError("forbidden");
      set.status = "in_review";
      break;
    case "approve":
      // Only the doctor (clinical owner) can medically approve.
      if (!can(actor.roles, "content:medical_approve")) throw new CmsError("Only the doctor can give medical approval");
      if (a.references && (a.references as unknown[]).length === 0 && plainText(a.blocks as Block[]).length > 1500) throw new CmsError("Add references before approving a long medical article");
      set.status = "approved";
      set.approvedRevision = a.revision;
      set.medicalReviewerUserId = actor.userId;
      set.medicalReviewerName = actor.name;
      set.medicallyReviewedAt = now;
      set.reviewDueAt = new Date(now.getTime() + (opts.reviewMonths ?? 12) * 30 * 86400_000);
      await database.update(editorialTasks).set({ status: "done" }).where(and(eq(editorialTasks.articleId, id), eq(editorialTasks.status, "open")));
      break;
    case "request_changes":
      if (!can(actor.roles, "content:medical_approve")) throw new CmsError("forbidden");
      set.status = "changes_requested";
      break;
    case "publish":
    case "schedule":
      if (!can(actor.roles, "content:publish")) throw new CmsError("forbidden");
      if (a.approvedRevision !== a.revision) throw new CmsError("This revision has not been medically approved");
      if (op === "schedule") {
        if (!opts.scheduledFor || opts.scheduledFor <= now) throw new CmsError("Choose a future date");
        set.status = "scheduled";
        set.scheduledFor = opts.scheduledFor;
      } else {
        set.status = "published";
        set.publishedAt = a.publishedAt ?? now;
      }
      break;
    case "unpublish":
      if (!can(actor.roles, "content:publish")) throw new CmsError("forbidden");
      set.status = "unpublished";
      break;
  }
  await database.update(articles).set(set).where(eq(articles.id, id));
  await audit(database, actor, `article.${op}`, "article", id, { revision: a.revision, note: opts.note });
}

/** Public read: the latest *approved* snapshot of a published article (unreviewed edits never leak). */
export async function publishedArticle(database: Db, locale: string, slug: string) {
  const [a] = await database.select().from(articles).where(and(eq(articles.locale, locale), eq(articles.slug, slug), eq(articles.status, "published")));
  if (!a) return null;
  if (a.approvedRevision === a.revision) return a;
  const [rev] = await database.select().from(articleRevisions).where(and(eq(articleRevisions.articleId, a.id), eq(articleRevisions.revision, a.approvedRevision ?? -1)));
  return rev ? ({ ...(rev.snapshot as typeof a), status: "published" as const, publishedAt: a.publishedAt } as typeof a) : null;
}

export async function publishedArticles(database: Db, locale: string) {
  const rows = await database.select().from(articles).where(and(eq(articles.locale, locale), eq(articles.status, "published"))).orderBy(desc(articles.publishedAt));
  const out = [];
  for (const r of rows) {
    const a = await publishedArticle(database, locale, r.slug);
    if (a) out.push(a);
  }
  return out;
}

export async function latestRevision(database: Db, id: string) {
  const [{ m }] = await database.select({ m: max(articleRevisions.revision) }).from(articleRevisions).where(eq(articleRevisions.articleId, id));
  return m ?? 0;
}
