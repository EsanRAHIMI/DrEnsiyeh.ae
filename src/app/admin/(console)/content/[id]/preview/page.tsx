import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { articles } from "@/db/schema";
import { requireStaff } from "@/server/auth/session";
import { ArticleBody } from "@/components/ArticleBody";
import type { Block } from "@/server/cms/blocks";

export default async function Preview({ params }: PageProps<"/admin/content/[id]/preview">) {
  await requireStaff("content:edit");
  const { id } = await params;
  const [a] = await db().select().from(articles).where(eq(articles.id, id));
  if (!a) notFound();
  return (
    <article className="mx-auto max-w-3xl">
      <p className="mb-4 rounded-xl bg-brass-tint p-3 text-sm text-brass">Preview of revision {a.revision} ({a.status}). Not public.</p>
      <h1 className="text-4xl text-ink">{a.title}</h1>
      {a.excerpt && <p className="mt-4 text-lg text-ink-soft">{a.excerpt}</p>}
      <div className="mt-8"><ArticleBody blocks={a.blocks as Block[]} /></div>
    </article>
  );
}
