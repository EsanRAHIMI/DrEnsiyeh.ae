import type { MetadataRoute } from "next";
import { db } from "@/db";
import { indexedLocales } from "@/i18n/config";
import { baseUrl } from "@/lib/site";
import { SERVICE_AREAS } from "@/content/service-areas";
import { LEGAL_DOCS } from "@/content/legal";
import { publishedArticles } from "@/server/cms/articles";
import { PROFILE } from "@/content/profile";

export const revalidate = 3600;

/** Only indexable URLs: reviewed locales, medically approved pages, non-draft legal docs. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const b = baseUrl();
  const out: MetadataRoute.Sitemap = [];
  for (const l of indexedLocales()) {
    const statics = ["", "/about", "/services", "/clinic-visit", "/home-visit", "/locations", "/patient-information", "/faq", "/contact", "/articles", "/book"];
    if (PROFILE.qualifications.verified) statics.push("/qualifications");
    for (const p of statics) out.push({ url: `${b}/${l}${p}`, changeFrequency: "weekly", priority: p === "" ? 1 : 0.7 });
    for (const a of SERVICE_AREAS.filter((x) => x.medicallyReviewedAt)) out.push({ url: `${b}/${l}/services/${a.slug}`, lastModified: a.medicallyReviewedAt!, priority: 0.8 });
    for (const d of LEGAL_DOCS.filter((x) => !x.version.endsWith("draft"))) out.push({ url: `${b}/${l}/legal/${d.slug}`, priority: 0.2 });
    const arts = await publishedArticles(db(), l).catch(() => []);
    for (const a of arts) if (!a.canonicalUrl) out.push({ url: `${b}/${l}/articles/${a.slug}`, lastModified: a.medicallyReviewedAt ?? a.updatedAt, priority: 0.6 });
  }
  return out;
}
