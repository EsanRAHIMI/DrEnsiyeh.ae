import Link from "next/link";
import { localeFrom } from "@/i18n/server";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/PageHero";
import { PROFILE } from "@/content/profile";
import { JsonLd } from "@/components/JsonLd";
import { physicianJsonLd } from "@/lib/structured-data";
import { getPublicFacilities } from "@/server/catalog";

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[locale]/about">) {
  const { locale } = await localeFrom(params);
  return pageMetadata({ locale, path: "/about", title: `About ${PROFILE.name.value}`, description: `${PROFILE.name.value}, ${PROFILE.title.value} in Dubai. Languages: ${PROFILE.languages.value.join(", ")}.` });
}

export default async function About({ params }: PageProps<"/[locale]/about">) {
  const { locale, t } = await localeFrom(params);
  const facilities = await getPublicFacilities().catch(() => []);
  return (
    <>
      <JsonLd data={physicianJsonLd(facilities)} />
      <PageHero
        eyebrow={PROFILE.title.value}
        title={PROFILE.name.value}
        intro="An infectious diseases specialist practising in Dubai, focused on careful diagnosis, responsible antibiotic use and clear communication."
        crumbs={[{ name: "Home", href: `/${locale}` }, { name: t.nav.about, href: `/${locale}/about` }]}
      />
      <div className="container-page grid gap-12 py-14 lg:grid-cols-[2fr_1fr]">
        <div className="prose-medical">
          <h2>Clinical interests</h2>
          <ul>
            {PROFILE.areasOfFocus.value.map((a) => (
              <li key={a.key}>{a.en}</li>
            ))}
          </ul>
          <h2>Research</h2>
          <p>{PROFILE.research.value}.</p>
          <h2>Languages</h2>
          <p>Consultations are available in {PROFILE.languages.value.join(" and ")}.</p>
          <p>
            <Link href={`/${locale}/qualifications`}>Qualifications and professional registration →</Link>
          </p>
        </div>
        <aside className="card h-fit p-6">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-muted">Specialty</dt>
              <dd className="font-medium text-ink">{PROFILE.title.value}</dd>
            </div>
            <div>
              <dt className="text-muted">Languages</dt>
              <dd className="font-medium text-ink">{PROFILE.languages.value.join(", ")}</dd>
            </div>
            {PROFILE.dhaLicense.verified && PROFILE.dhaLicense.value && (
              <div>
                <dt className="text-muted">DHA licence</dt>
                <dd className="font-medium text-ink">{PROFILE.dhaLicense.value}</dd>
              </div>
            )}
          </dl>
          <Link href={`/${locale}/book`} className="btn-primary mt-6 w-full">{t.cta.book}</Link>
        </aside>
      </div>
    </>
  );
}
