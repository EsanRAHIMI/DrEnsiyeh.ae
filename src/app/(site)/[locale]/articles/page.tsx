import Link from "next/link";
import { localeFrom } from "@/i18n/server";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/PageHero";
import { db } from "@/db";
import { publishedArticles } from "@/server/cms/articles";
import { fmtDate } from "@/lib/format";
import { readingMinutes, type Block } from "@/server/cms/blocks";

export const revalidate = 600;

export async function generateMetadata({ params }: PageProps<"/[locale]/articles">) {
  const { locale } = await localeFrom(params);
  return pageMetadata({ locale, path: "/articles", title: "Medical articles", description: "Medically reviewed articles on infections, travel health, prevention and responsible antibiotic use." });
}

export default async function Articles({ params }: PageProps<"/[locale]/articles">) {
  const { locale, t } = await localeFrom(params);
  const rows = await publishedArticles(db(), locale).catch(() => []);
  return (
    <>
      <PageHero title="Medical articles" intro="Written or reviewed by Dr. Ensiyeh Rahimi. Every article shows when it was last medically reviewed." crumbs={[{ name: "Home", href: `/${locale}` }, { name: t.nav.articles, href: `/${locale}/articles` }]} />
      <div className="container-page py-14">
        {rows.length === 0 ? (
          <p className="text-ink-soft">New articles are being prepared and medically reviewed. Please check back soon.</p>
        ) : (
          <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((a) => (
              <li key={a.id}>
                <Link href={`/${locale}/articles/${a.slug}`} className="card flex h-full flex-col p-6 hover:shadow-[var(--shadow-lift)]">
                  <h2 className="text-xl text-ink">{a.title}</h2>
                  {a.excerpt && <p className="mt-2 flex-1 text-[15px] text-ink-soft">{a.excerpt}</p>}
                  <p className="mt-4 text-xs text-muted">Reviewed {a.medicallyReviewedAt ? fmtDate(a.medicallyReviewedAt) : "—"} · {readingMinutes(a.blocks as Block[])} min read</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
