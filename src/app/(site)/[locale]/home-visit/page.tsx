import Link from "next/link";
import { localeFrom } from "@/i18n/server";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/PageHero";
import { getCatalog, getZones } from "@/server/catalog";
import { formatMoney } from "@/lib/money";
import { EmergencyNotice } from "@/components/EmergencyNotice";
import { db } from "@/db";
import { capabilityBlockers, getCompliance } from "@/server/compliance";

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<"/[locale]/home-visit">) {
  const { locale } = await localeFrom(params);
  return pageMetadata({ locale, path: "/home-visit", title: "Doctor home visit in Dubai", description: "A scheduled, non-emergency infectious diseases specialist visit at your home within the approved Dubai service area." });
}

export default async function HomeVisit({ params }: PageProps<"/[locale]/home-visit">) {
  const { locale, t } = await localeFrom(params);
  const [rows, zones, compliance] = await Promise.all([
    getCatalog().catch(() => []),
    getZones().catch(() => []),
    getCompliance(db()).catch(() => null),
  ]);
  const offering = rows.find((r) => r.service.kind === "home_visit");
  const enabled = compliance ? capabilityBlockers(compliance, "home_visits").length === 0 : false;
  return (
    <>
      <PageHero
        eyebrow="Service B"
        title="Doctor home visit"
        intro="For patients who are unable or prefer not to travel, the doctor can visit you at home by appointment within the approved service area."
        crumbs={[{ name: "Home", href: `/${locale}` }, { name: t.nav.home, href: `/${locale}/home-visit` }]}
      >
        {enabled ? (
          <Link href={`/${locale}/book?kind=home_visit`} className="btn-primary mt-8">{t.cta.bookHome}</Link>
        ) : (
          <p className="mt-8 inline-block rounded-2xl bg-white px-5 py-3 text-sm font-medium text-ink-soft shadow-[var(--shadow-soft)]">{t.booking.homeUnavailable}</p>
        )}
      </PageHero>
      <div className="container-page grid gap-10 py-14 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-10">
          <section>
            <h2 className="text-2xl text-ink">How it works</h2>
            <ol className="mt-5 grid gap-4 sm:grid-cols-2">
              {["Enter your address and drop a pin on the map", "We check the address is inside the service area and show the full price", "Pick a date and time, add access instructions", "Pay securely and receive confirmation and updates"].map((s, i) => (
                <li key={s} className="card p-5 text-ink-soft"><span className="font-display text-2xl text-teal">{i + 1}</span><p className="mt-2">{s}</p></li>
              ))}
            </ol>
          </section>
          <section>
            <h2 className="text-2xl text-ink">Service area & pricing</h2>
            {offering && <p className="mt-3 text-ink-soft">Home visit fee: <strong className="text-ink">{formatMoney(offering.offering.priceMinor)}</strong>, plus any travel surcharge shown below. The total is shown before payment.</p>}
            <ul className="mt-5 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-white">
              {zones.map((z) => (
                <li key={z.id} className="flex items-center justify-between px-5 py-4">
                  <span className="font-medium text-ink">{z.name}</span>
                  <span className="text-sm text-ink-soft">{z.surchargeMinor ? `+ ${formatMoney(z.surchargeMinor)} travel` : "No travel surcharge"}</span>
                </li>
              ))}
              {zones.length === 0 && <li className="px-5 py-4 text-ink-soft">Service areas will be published once confirmed.</li>}
            </ul>
          </section>
          <section className="prose-medical">
            <h2>What a home visit is — and is not</h2>
            <p>Home visits are planned specialist consultations. They are not an emergency or urgent-response service, and the doctor may advise hospital assessment if your condition requires it.</p>
          </section>
        </div>
        <aside className="space-y-5">
          <EmergencyNotice t={t} />
        </aside>
      </div>
    </>
  );
}
