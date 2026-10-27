import Link from "next/link";
import { localeFrom } from "@/i18n/server";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/PageHero";
import { getCatalog } from "@/server/catalog";
import { pickLocalized } from "@/i18n/dictionaries";
import { formatMoney } from "@/lib/money";
import { EmergencyNotice } from "@/components/EmergencyNotice";

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<"/[locale]/clinic-visit">) {
  const { locale } = await localeFrom(params);
  return pageMetadata({ locale, path: "/clinic-visit", title: "In-clinic consultation", description: "Book an in-person infectious diseases consultation in Dubai. Transparent prices, live availability and clear cancellation terms." });
}

export default async function ClinicVisit({ params }: PageProps<"/[locale]/clinic-visit">) {
  const { locale, t } = await localeFrom(params);
  const rows = (await getCatalog().catch(() => [])).filter((r) => r.service.kind === "clinic");
  return (
    <>
      <PageHero
        eyebrow="Service A"
        title="In-clinic consultation"
        intro="Meet the doctor in person at an approved Dubai facility. Choose a time that suits you and know the price before you book."
        crumbs={[{ name: "Home", href: `/${locale}` }, { name: t.nav.clinic, href: `/${locale}/clinic-visit` }]}
      >
        <Link href={`/${locale}/book?kind=clinic`} className="btn-primary mt-8">{t.cta.bookClinic}</Link>
      </PageHero>
      <div className="container-page grid gap-10 py-14 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          {rows.length === 0 && <p className="text-ink-soft">Clinic schedules will appear here once locations are confirmed.</p>}
          {rows.map((r) => {
            const policy = r.facility?.cancellationPolicy as { freeCancelHours: number; lateCancelRefundPercent: number } | undefined;
            return (
              <article key={r.offering.id} className="card p-6 sm:p-7">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <h2 className="text-2xl text-ink">{pickLocalized(r.service.name, locale)}</h2>
                    <p className="mt-1 text-ink-soft">{pickLocalized(r.service.summary, locale)}</p>
                  </div>
                  <p className="shrink-0 text-2xl font-semibold text-ink tabular-nums">{formatMoney(r.offering.priceMinor, r.offering.currency, locale)}</p>
                </div>
                <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                  <Item label="Location" value={r.facility ? `${r.facility.name}${r.facility.addressLine ? ` — ${r.facility.addressLine}` : ""}` : "—"} />
                  <Item label={t.booking.duration} value={`${r.offering.durationMinutes ?? r.service.durationMinutes} ${t.booking.minutes}`} />
                  <Item label="Payment" value={r.facility?.paymentMode === "prepay" ? "Paid online when booking (secure card, Apple Pay, Google Pay)" : "Paid at the facility"} />
                  <Item label="Cancellation" value={policy ? `Free up to ${policy.freeCancelHours} hours before; later cancellations ${policy.lateCancelRefundPercent}% refundable` : "See policy"} />
                  <Item label="Confirmation" value={r.facility?.confirmationMode === "auto_on_payment" ? "Confirmed once payment succeeds" : "Confirmed by the facility after booking"} />
                  <Item label="Insurance" value={r.facility?.insuranceNote ?? "Self-pay. Insurance billing is not currently supported online."} />
                </dl>
                {pickLocalized(r.service.preparation, locale) && (
                  <p className="mt-5 rounded-xl bg-sage p-4 text-sm text-ink-soft"><strong className="text-ink">Before your visit:</strong> {pickLocalized(r.service.preparation, locale)}</p>
                )}
                <Link href={`/${locale}/book?kind=clinic&service=${r.service.slug}`} className="btn-primary mt-6">{t.cta.viewTimes}</Link>
              </article>
            );
          })}
        </div>
        <aside className="space-y-5">
          <EmergencyNotice t={t} compact />
          <p className="text-sm text-ink-soft">
            Read the <Link className="text-teal underline" href={`/${locale}/legal/cancellation-refund`}>cancellation & refund policy</Link>.
          </p>
        </aside>
      </div>
    </>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{value}</dd>
    </div>
  );
}
