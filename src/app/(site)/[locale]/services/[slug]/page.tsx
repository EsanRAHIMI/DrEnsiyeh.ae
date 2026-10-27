import Link from "next/link";
import { notFound } from "next/navigation";
import { localeFrom } from "@/i18n/server";
import { pageMetadata } from "@/lib/seo";
import { PageHero, ReviewPendingNotice } from "@/components/PageHero";
import { SERVICE_AREAS, getServiceArea } from "@/content/service-areas";
import { EmergencyNotice } from "@/components/EmergencyNotice";
import { JsonLd } from "@/components/JsonLd";
import { baseUrl } from "@/lib/site";
import { LOCALES } from "@/i18n/config";

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => SERVICE_AREAS.map((a) => ({ locale, slug: a.slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/services/[slug]">) {
  const { locale } = await localeFrom(params);
  const { slug } = await params;
  const a = getServiceArea(slug);
  if (!a) return {};
  return pageMetadata({ locale, path: `/services/${slug}`, title: `${a.title} — specialist care in Dubai`, description: a.summary, noindex: !a.medicallyReviewedAt });
}

export default async function ServiceArea({ params }: PageProps<"/[locale]/services/[slug]">) {
  const { locale, t } = await localeFrom(params);
  const { slug } = await params;
  const a = getServiceArea(slug);
  if (!a) notFound();
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "MedicalWebPage",
          name: a.title,
          url: `${baseUrl()}/${locale}/services/${slug}`,
          about: { "@type": "MedicalSpecialty", name: "Infectious disease" },
          ...(a.medicallyReviewedAt ? { lastReviewed: a.medicallyReviewedAt, reviewedBy: { "@id": `${baseUrl()}/#physician` } } : {}),
          mainEntityOfPage: { "@id": `${baseUrl()}/#physician` },
        }}
      />
      {a.faqs.length > 0 && a.medicallyReviewedAt && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: a.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          }}
        />
      )}
      <PageHero
        eyebrow="Service"
        title={a.title}
        intro={a.intro}
        crumbs={[{ name: "Home", href: `/${locale}` }, { name: t.nav.services, href: `/${locale}/services` }, { name: a.title, href: `/${locale}/services/${slug}` }]}
      >
        {!a.medicallyReviewedAt && <ReviewPendingNotice />}
      </PageHero>
      <div className="container-page grid gap-12 py-14 lg:grid-cols-[2fr_1fr]">
        <article className="prose-medical">
          <h2>When to consider a specialist</h2>
          <ul>{a.whenToSee.map((x) => <li key={x}>{x}</li>)}</ul>
          <h2>What to expect</h2>
          <ul>{a.whatToExpect.map((x) => <li key={x}>{x}</li>)}</ul>
          {a.faqs.length > 0 && (
            <>
              <h2>Common questions</h2>
              {a.faqs.map((f) => (
                <div key={f.q}>
                  <h3>{f.q}</h3>
                  <p>{f.a}</p>
                </div>
              ))}
            </>
          )}
          {a.references.length > 0 && (
            <>
              <h2>References</h2>
              <ul>{a.references.map((r) => <li key={r.url}><a href={r.url} rel="noopener" target="_blank">{r.title}</a></li>)}</ul>
            </>
          )}
          <p className="text-sm text-muted">
            {a.medicallyReviewedAt ? `Medically reviewed by ${a.reviewer} on ${a.medicallyReviewedAt}.` : "This page is general information and does not replace an individual consultation."}
          </p>
        </article>
        <aside className="space-y-5">
          <div className="card p-6">
            <p className="font-display text-xl text-ink">Book a consultation</p>
            <p className="mt-2 text-sm text-ink-soft">See prices and available times — no account needed to start.</p>
            <Link href={`/${locale}/book?kind=clinic`} className="btn-primary mt-5 w-full">{t.cta.bookClinic}</Link>
            <Link href={`/${locale}/book?kind=home_visit`} className="btn-secondary mt-3 w-full">{t.cta.bookHome}</Link>
          </div>
          <EmergencyNotice t={t} compact />
        </aside>
      </div>
    </>
  );
}
