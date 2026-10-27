import { localeFrom } from "@/i18n/server";
import { pageMetadata } from "@/lib/seo";
import { getCatalog, getZones } from "@/server/catalog";
import { db } from "@/db";
import { capabilityBlockers, getCompliance, paymentsEnabled } from "@/server/compliance";
import { pickLocalized } from "@/i18n/dictionaries";
import { BookingFlow, type OfferingOption } from "@/components/booking/BookingFlow";
import { EmergencyNotice } from "@/components/EmergencyNotice";
import { CONSENT_VERSION } from "@/lib/consent-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/book">) {
  const { locale } = await localeFrom(params);
  return pageMetadata({ locale, path: "/book", title: "Book an appointment", description: "Choose a clinic consultation or home visit, see live availability and book securely." });
}

export default async function Book({ params, searchParams }: PageProps<"/[locale]/book">) {
  const { locale, t } = await localeFrom(params);
  const sp = await searchParams;
  const [catalog, zones, compliance] = await Promise.all([getCatalog(), getZones(), getCompliance(db())]);
  const homeEnabled = capabilityBlockers(compliance, "home_visits").length === 0;
  const payMode = paymentsEnabled(compliance);
  const options: OfferingOption[] = catalog.map((r) => ({
    offeringId: r.offering.id,
    kind: r.service.kind,
    serviceSlug: r.service.slug,
    serviceName: pickLocalized(r.service.name, locale),
    summary: pickLocalized(r.service.summary, locale),
    preparation: pickLocalized(r.service.preparation, locale),
    facilityName: r.facility?.name ?? null,
    facilitySlug: r.facility?.slug ?? null,
    facilityAddress: r.facility?.addressLine ?? null,
    priceMinor: r.offering.priceMinor,
    currency: r.offering.currency,
    durationMinutes: r.offering.durationMinutes ?? r.service.durationMinutes,
    prepay: (r.facility?.paymentMode === "prepay" || r.service.kind === "home_visit") && payMode !== "disabled",
    autoConfirm: r.facility?.confirmationMode === "auto_on_payment",
    cancellation: (r.facility?.cancellationPolicy as { freeCancelHours: number; lateCancelRefundPercent: number } | null) ?? null,
  }));
  const kind = sp.kind === "home_visit" ? "home_visit" : sp.kind === "clinic" ? "clinic" : null;
  return (
    <div className="container-page py-8 sm:py-12">
      <h1 className="text-3xl text-ink sm:text-4xl">{t.booking.title}</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <BookingFlow
          locale={locale}
          t={t.booking}
          options={options}
          homeEnabled={homeEnabled}
          zones={zones.map((z) => ({ id: z.id, name: z.name, lat: z.centerLat, lng: z.centerLng, surchargeMinor: z.surchargeMinor }))}
          initialKind={kind}
          initialService={typeof sp.service === "string" ? sp.service : null}
          initialFacility={typeof sp.facility === "string" ? sp.facility : null}
          policyVersion={CONSENT_VERSION}
          mapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
          emergencyText={t.emergency}
        />
        <aside className="space-y-5 lg:sticky lg:top-28 lg:h-fit">
          <EmergencyNotice t={t} compact />
          <p className="text-xs leading-relaxed text-muted">{t.booking.notConfirmedYet}</p>
        </aside>
      </div>
    </div>
  );
}
