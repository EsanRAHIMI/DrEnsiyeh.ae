import Link from "next/link";
import { localeFrom } from "@/i18n/server";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/PageHero";
import { SERVICE_AREAS } from "@/content/service-areas";
import { IconArrow } from "@/components/icons";

export async function generateMetadata({ params }: PageProps<"/[locale]/services">) {
  const { locale } = await localeFrom(params);
  return pageMetadata({ locale, path: "/services", title: "Infectious disease services in Dubai", description: "Specialist consultations for recurrent, persistent, travel-related and antibiotic-resistant infections." });
}

export default async function Services({ params }: PageProps<"/[locale]/services">) {
  const { locale, t } = await localeFrom(params);
  return (
    <>
      <PageHero
        eyebrow="Services"
        title="Infectious disease services"
        intro="Consultations focus on infections that are complex, recurrent, persistent or related to travel — and on using antibiotics responsibly."
        crumbs={[{ name: "Home", href: `/${locale}` }, { name: t.nav.services, href: `/${locale}/services` }]}
      />
      <div className="container-page py-14">
        <ul className="grid gap-5 md:grid-cols-2">
          {SERVICE_AREAS.map((a) => (
            <li key={a.slug}>
              <Link href={`/${locale}/services/${a.slug}`} className="card group flex h-full flex-col p-7 hover:shadow-[var(--shadow-lift)]">
                <h2 className="text-2xl text-ink">{a.title}</h2>
                <p className="mt-2 flex-1 text-ink-soft">{a.summary}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-teal">Learn more <IconArrow className="size-4" /></span>
              </Link>
            </li>
          ))}
          <li>
            <div className="card flex h-full flex-col bg-sand p-7">
              <h2 className="text-2xl text-ink">Follow-up consultations</h2>
              <p className="mt-2 flex-1 text-ink-soft">Review of results and progress after a previous visit. Returning patients can book from their account.</p>
              <Link href={`/${locale}/book?kind=clinic`} className="btn-primary mt-6 self-start">{t.cta.bookClinic}</Link>
            </div>
          </li>
        </ul>
      </div>
    </>
  );
}
