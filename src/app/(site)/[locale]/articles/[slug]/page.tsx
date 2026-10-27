import Link from "next/link";
import { notFound } from "next/navigation";
import { localeFrom } from "@/i18n/server";
import { pageMetadata } from "@/lib/seo";
import { db } from "@/db";
import { publishedArticle } from "@/server/cms/articles";
import { ArticleBody } from "@/components/ArticleBody";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { EmergencyNotice } from "@/components/EmergencyNotice";
import { fmtDate } from "@/lib/format";
import { baseUrl } from "@/lib/site";
import { readingMinutes, type Block } from "@/server/cms/blocks";

export const revalidate = 600;

export async function generateMetadata({ params }: PageProps<"/[locale]/articles/[slug]">) {
  const { locale } = await localeFrom(params);
  const { slug } = await params;
  const a = await publishedArticle(db(), locale, slug).catch(() => null);
  if (!a) return {};
  const meta = pageMetadata({ locale, path: `/articles/${slug}`, title: a.seoTitle || a.title, description: a.seoDescription || a.excerpt || a.title, image: a.heroImageUrl ?? undefined, type: "article" });
  if (a.canonicalUrl) meta.alternates = { ...meta.alternates, canonical: a.canonicalUrl };
  return meta;
}

export default async function Article({ params }: PageProps<"/[locale]/articles/[slug]">) {
  const { locale, t } = await localeFrom(params);
  const { slug } = await params;
  const a = await publishedArticle(db(), locale, slug);
  if (!a) notFound();
  const blocks = a.blocks as Block[];
  const refs = a.references as { title: string; url: string }[];
  const faqs = blocks.filter((b): b is Extract<Block, { type: "faq" }> => b.type === "faq");
  const url = `${baseUrl()}/${locale}/articles/${slug}`;
  return (
    <article>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "MedicalWebPage",
          headline: a.title,
          description: a.excerpt ?? undefined,
          url,
          inLanguage: locale,
          datePublished: a.publishedAt?.toISOString(),
          dateModified: (a.medicallyReviewedAt ?? a.updatedAt).toISOString(),
          lastReviewed: a.medicallyReviewedAt?.toISOString().slice(0, 10),
          author: { "@type": "Person", name: a.authorName },
          reviewedBy: a.medicalReviewerName ? { "@id": `${baseUrl()}/#physician` } : undefined,
          citation: refs.map((r) => ({ "@type": "CreativeWork", name: r.title, url: r.url })),
          image: a.heroImageUrl ?? undefined,
          publisher: { "@id": `${baseUrl()}/#physician` },
        }}
      />
      {faqs.length > 0 && (
        <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      )}
      <header className="border-b border-line bg-gradient-to-b from-sage to-paper">
        <div className="container-page max-w-3xl py-10 sm:py-14">
          <Breadcrumbs items={[{ name: "Home", href: `/${locale}` }, { name: t.nav.articles, href: `/${locale}/articles` }, { name: a.title, href: `/${locale}/articles/${slug}` }]} />
          <h1 className="mt-8 text-4xl leading-tight text-ink sm:text-5xl">{a.title}</h1>
          {a.excerpt && <p className="mt-5 text-lg text-ink-soft">{a.excerpt}</p>}
          <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
            <div><dt className="inline">By </dt><dd className="inline text-ink-soft">{a.authorName}</dd></div>
            {a.medicalReviewerName && <div><dt className="inline">Medically reviewed by </dt><dd className="inline text-ink-soft">{a.medicalReviewerName}</dd></div>}
            {a.publishedAt && <div><dt className="inline">Published </dt><dd className="inline">{fmtDate(a.publishedAt)}</dd></div>}
            {a.medicallyReviewedAt && <div><dt className="inline">Last reviewed </dt><dd className="inline">{fmtDate(a.medicallyReviewedAt)}</dd></div>}
            <div>{readingMinutes(blocks)} min read</div>
          </dl>
        </div>
      </header>
      <div className="container-page max-w-3xl py-12">
        <ArticleBody blocks={blocks} />
        {refs.length > 0 && (
          <section className="mt-12 border-t border-line pt-8">
            <h2 className="text-xl text-ink">References</h2>
            <ol className="mt-4 list-decimal space-y-2 ps-6 text-sm text-ink-soft">{refs.map((r) => <li key={r.url}><a className="text-teal underline" href={r.url} rel="noopener" target="_blank">{r.title}</a></li>)}</ol>
          </section>
        )}
        <p className="mt-10 rounded-2xl bg-sage p-5 text-sm text-ink-soft">This article is general information and does not replace a consultation. <Link href={`/${locale}/legal/medical-disclaimer`} className="text-teal underline">Medical disclaimer</Link>.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href={`/${locale}/book?kind=clinic`} className="btn-primary">{t.cta.bookClinic}</Link>
          <Link href={`/${locale}/book?kind=home_visit`} className="btn-secondary">{t.cta.bookHome}</Link>
        </div>
        <div className="mt-10"><EmergencyNotice t={t} compact /></div>
      </div>
    </article>
  );
}
