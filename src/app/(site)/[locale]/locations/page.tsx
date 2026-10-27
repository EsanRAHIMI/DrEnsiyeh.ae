import Link from "next/link";
import { localeFrom } from "@/i18n/server";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/PageHero";
import { getPublicFacilities } from "@/server/catalog";
import { IconPin } from "@/components/icons";

export const revalidate = 600;

export async function generateMetadata({ params }: PageProps<"/[locale]/locations">) {
  const { locale } = await localeFrom(params);
  return pageMetadata({ locale, path: "/locations", title: "Clinic locations in Dubai", description: "Where to see Dr. Ensiyeh Rahimi in Dubai — addresses, maps and directions." });
}

export default async function Locations({ params }: PageProps<"/[locale]/locations">) {
  const { locale, t } = await localeFrom(params);
  const facilities = await getPublicFacilities().catch(() => []);
  return (
    <>
      <PageHero title="Clinic locations" intro="Appointments take place only at licensed facilities where the doctor holds privileges." crumbs={[{ name: "Home", href: `/${locale}` }, { name: t.nav.locations, href: `/${locale}/locations` }]} />
      <div className="container-page grid gap-6 py-14 md:grid-cols-2">
        {facilities.length === 0 && <p className="text-ink-soft">Locations will be listed here once confirmed.</p>}
        {facilities.map((f) => (
          <article id={f.slug} key={f.id} className="card overflow-hidden">
            {f.lat && f.lng && f.status === "verified" ? (
              <iframe
                title={`Map of ${f.name}`}
                className="h-56 w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps?q=${f.lat},${f.lng}&z=15&output=embed`}
              />
            ) : (
              <div className="grid h-40 place-items-center bg-sage text-sm text-muted">Map shown once the address is verified</div>
            )}
            <div className="p-6">
              <h2 className="flex items-center gap-2 text-xl text-ink"><IconPin className="size-5 text-teal" /> {f.name}</h2>
              <p className="mt-2 text-ink-soft">{[f.addressLine, f.area, f.emirate].filter(Boolean).join(", ")}</p>
              {f.status !== "verified" && <p className="mt-3 text-xs font-semibold text-brass">Pending verification</p>}
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={`/${locale}/book?kind=clinic&facility=${f.slug}`} className="btn-primary min-h-11 px-5 text-sm">{t.cta.bookClinic}</Link>
                {f.lat && f.lng && f.status === "verified" && (
                  <a className="btn-secondary min-h-11 px-5 text-sm" href={`https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}`} target="_blank" rel="noopener">Directions</a>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
