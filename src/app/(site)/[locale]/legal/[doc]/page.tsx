import { notFound } from "next/navigation";
import { localeFrom } from "@/i18n/server";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/PageHero";
import { LEGAL_DOCS, getLegalDoc } from "@/content/legal";
import { LOCALES } from "@/i18n/config";
import { ConsentPreferencesButton } from "@/components/ConsentPreferencesButton";

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => LEGAL_DOCS.map((d) => ({ locale, doc: d.slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/legal/[doc]">) {
  const { locale } = await localeFrom(params);
  const { doc } = await params;
  const d = getLegalDoc(doc);
  if (!d) return {};
  return pageMetadata({ locale, path: `/legal/${doc}`, title: d.title, description: `${d.title} for drensiyeh.ae.`, noindex: d.version.endsWith("draft") });
}

export default async function Legal({ params }: PageProps<"/[locale]/legal/[doc]">) {
  const { locale } = await localeFrom(params);
  const { doc } = await params;
  const d = getLegalDoc(doc);
  if (!d) notFound();
  return (
    <>
      <PageHero title={d.title} crumbs={[{ name: "Home", href: `/${locale}` }, { name: d.title, href: `/${locale}/legal/${doc}` }]}>
        <p className="mt-4 text-sm text-muted">Version {d.version}</p>
        {d.version.endsWith("draft") && process.env.DEPLOY_ENV !== "production" && (
          <p className="mt-3 inline-block rounded-full bg-brass-tint px-4 py-1.5 text-xs font-semibold text-brass">Draft — pending legal review</p>
        )}
      </PageHero>
      <article className="container-page prose-medical max-w-3xl py-14">
        {d.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.p.map((p) => <p key={p}>{p}</p>)}
          </section>
        ))}
        {doc === "cookies" && <ConsentPreferencesButton />}
      </article>
    </>
  );
}
