"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { actorOf, requireStaff } from "@/server/auth/session";
import type { Role } from "@/lib/rbac";
import { CmsError, createArticle, transitionArticle, updateArticle } from "@/server/cms/articles";

type R = { ok?: boolean; error?: string; id?: string } | null;

async function actor() {
  const u = await requireStaff("content:edit");
  return { ...actorOf(u), roles: u.roles as Role[], name: u.displayName ?? u.email ?? "Editor" };
}

function parsePayload(form: FormData) {
  const raw = JSON.parse(String(form.get("payload") ?? "{}"));
  return z
    .object({
      title: z.string().min(5, "Title is too short").max(160),
      slug: z.string().max(100).optional(),
      excerpt: z.string().max(400).nullable().optional(),
      blocks: z.unknown(),
      references: z.unknown(),
      categoryId: z.string().nullable().optional(),
      tags: z.array(z.string().max(40)).max(20).optional(),
      seoTitle: z.string().max(70, "SEO title should be ≤ 70 characters").nullable().optional(),
      seoDescription: z.string().max(170, "Meta description should be ≤ 170 characters").nullable().optional(),
      canonicalUrl: z.string().max(300).nullable().optional(),
      heroImageUrl: z.string().max(500).nullable().optional(),
      heroImageAlt: z.string().max(300).nullable().optional(),
    })
    .parse(raw);
}

function err(e: unknown): R {
  if (e instanceof CmsError) return { error: e.message };
  if (e instanceof z.ZodError) return { error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  if ((e as { code?: string })?.code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505") return { error: "That URL slug is already used" };
  console.error("[cms]", e instanceof Error ? e.message : e);
  return { error: "Save failed" };
}

export async function saveArticle(_: R, form: FormData): Promise<R> {
  let id = String(form.get("id") ?? "");
  try {
    const a = await actor();
    const input = parsePayload(form);
    if (id) await updateArticle(db(), a, id, { ...input, categoryId: input.categoryId || null });
    else id = (await createArticle(db(), a, { ...input, categoryId: input.categoryId || null })).id;
  } catch (e) {
    return err(e);
  }
  revalidatePath("/admin/content");
  revalidatePath("/[locale]/articles", "layout");
  if (!form.get("id")) redirect(`/admin/content/${id}`);
  return { ok: true, id };
}

export async function workflow(_: R, form: FormData): Promise<R> {
  try {
    const a = await actor();
    const op = z.enum(["submit", "approve", "request_changes", "publish", "schedule", "unpublish"]).parse(form.get("op"));
    const when = form.get("scheduledFor") ? new Date(`${form.get("scheduledFor")}:00+04:00`) : undefined;
    await transitionArticle(db(), a, z.uuid().parse(form.get("id")), op, { scheduledFor: when, note: String(form.get("note") ?? "") || undefined, reviewMonths: Number(form.get("reviewMonths") ?? 12) });
  } catch (e) {
    return err(e);
  }
  revalidatePath("/admin/content", "layout");
  revalidatePath("/[locale]/articles", "layout");
  revalidatePath("/sitemap.xml");
  return { ok: true };
}
