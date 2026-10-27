import { localeFrom } from "@/i18n/server";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/PageHero";
import { FAQ } from "@/content/faq";
import { JsonLd } from "@/components/JsonLd";

export async function generateMetadata({ params }: PageProps<"/[locale]/faq">) {
  const { locale } = await localeFrom(params);
  return pageMetadata({ locale, path: "/faq", title: "Frequently asked questions", description: "Booking, payment, cancellation, insurance and privacy questions answered." });
}

export default async function Faq({ params }: PageProps<"/[locale]/faq">) {
  const { locale, t } = await localeFrom(params);
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <PageHero title="Frequently asked questions" crumbs={[{ name: "Home", href: `/${locale}` }, { name: t.nav.faq, href: `/${locale}/faq` }]} />
      <div className="container-page max-w-3xl py-14">
        <div className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-white">
          {FAQ.map((f) => (
            <details key={f.q} className="group p-5 sm:p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium text-ink">
                {f.q}
                <span aria-hidden className="text-2xl text-teal transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 leading-relaxed text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </>
  );
}
