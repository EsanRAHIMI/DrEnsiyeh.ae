import { localeFrom } from "@/i18n/server";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/PageHero";
import { PROFILE } from "@/content/profile";

export async function generateMetadata({ params }: PageProps<"/[locale]/qualifications">) {
  const { locale } = await localeFrom(params);
  // Not indexed until qualifications are verified with primary sources.
  return pageMetadata({ locale, path: "/qualifications", title: "Qualifications & experience", description: `Professional registration and qualifications of ${PROFILE.name.value}.`, noindex: !PROFILE.qualifications.verified });
}

export default async function Qualifications({ params }: PageProps<"/[locale]/qualifications">) {
  const { locale } = await localeFrom(params);
  return (
    <>
      <PageHero title="Qualifications & experience" crumbs={[{ name: "Home", href: `/${locale}` }, { name: "About", href: `/${locale}/about` }, { name: "Qualifications", href: `/${locale}/qualifications` }]} />
      <div className="container-page py-14">
        <div className="prose-medical max-w-3xl">
          <h2>Professional registration</h2>
          {PROFILE.dhaLicense.verified && PROFILE.dhaLicense.value ? (
            <p>Dubai Health Authority licence: {PROFILE.dhaLicense.value}</p>
          ) : (
            <p>Licensing details are being verified with the Dubai Health Authority and will be published here once confirmed.</p>
          )}
          <h2>Qualifications</h2>
          {PROFILE.qualifications.verified && PROFILE.qualifications.value.length ? (
            <ul>{PROFILE.qualifications.value.map((q) => <li key={q}>{q}</li>)}</ul>
          ) : (
            <p>Degrees and specialist training will be listed here after verification against original certificates.</p>
          )}
          <h2>Research</h2>
          <p>{PROFILE.research.value}.</p>
        </div>
      </div>
    </>
  );
}
