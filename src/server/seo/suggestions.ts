import { and, eq, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { articles } from "@/db/schema";
import { SERVICE_AREAS } from "@/content/service-areas";
import { plainText, type Block } from "@/server/cms/blocks";

const KEYWORDS: Record<string, string[]> = {
  "recurrent-urinary-tract-infections": ["urinary tract infection", "uti", "cystitis"],
  "persistent-unexplained-fever": ["fever of unknown origin", "persistent fever", "unexplained fever"],
  "travel-related-infections": ["travel", "vaccination", "malaria", "typhoid"],
  "antibiotic-resistant-infections": ["antibiotic resistance", "resistant bacteria", "antimicrobial"],
  "complex-and-recurrent-infections": ["cellulitis", "diabetic foot", "pneumonia", "recurrent infection"],
  "hiv-sti-and-hepatitis-care": ["hiv", "hepatitis", "sexually transmitted"],
};

/** Deterministic internal-link suggestions (editor decides; nothing is inserted automatically). */
export async function suggestInternalLinks(database: Db, a: typeof articles.$inferSelect) {
  const text = plainText(a.blocks as Block[]).toLowerCase();
  const existing = JSON.stringify(a.blocks);
  const out: { anchor: string; href: string; reason: string }[] = [];
  for (const area of SERVICE_AREAS) {
    const href = `/${a.locale}/services/${area.slug}`;
    if (existing.includes(href)) continue;
    const hit = KEYWORDS[area.slug]?.find((k) => text.includes(k));
    if (hit) out.push({ anchor: hit, href, reason: `mentions “${hit}” — link to the service page` });
  }
  const others = await database.select({ title: articles.title, slug: articles.slug, tags: articles.tags }).from(articles).where(and(eq(articles.status, "published"), eq(articles.locale, a.locale), ne(articles.id, a.id)));
  for (const o of others) {
    const href = `/${a.locale}/articles/${o.slug}`;
    if (existing.includes(href)) continue;
    const shared = o.tags.filter((t) => a.tags.includes(t));
    if (shared.length) out.push({ anchor: o.title, href, reason: `shares tag ${shared.join(", ")}` });
  }
  if (!existing.includes("/book")) out.push({ anchor: "book a consultation", href: `/${a.locale}/book`, reason: "no booking link yet" });
  return out.slice(0, 10);
}
