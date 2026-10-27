import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, homeVisitZones, offerings, services } from "@/db/schema";
import { requireStaff } from "@/server/auth/session";
import { can } from "@/lib/rbac";
import { PageTitle, Section } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/ActionForm";
import { pricingAction, verifyFacilityAction } from "../actions";
import { pickLocalized } from "@/i18n/dictionaries";

export default async function Pricing() {
  const user = await requireStaff("pricing:manage");
  const [rows, facs, zones] = await Promise.all([
    db().select({ o: offerings, s: services, f: facilities }).from(offerings).innerJoin(services, eq(services.id, offerings.serviceId)).leftJoin(facilities, eq(facilities.id, offerings.facilityId)),
    db().select().from(facilities),
    db().select().from(homeVisitZones),
  ]);
  return (
    <div className="max-w-5xl">
      <PageTitle title="Services & pricing" subtitle="Prices are in AED and shown publicly. Changes are audited and apply to new bookings only." />
      <Section title="Prices">
        <div className="grid gap-3">
          {rows.map(({ o, s, f }) => (
            <ActionForm key={o.id} action={pricingAction} submit="Save" tone="secondary" className="card grid items-end gap-3 p-4 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <input type="hidden" name="op" value="offering" /><input type="hidden" name="id" value={o.id} />
              <div><p className="font-medium text-ink">{pickLocalized(s.name, "en")}</p><p className="text-xs text-muted">{f?.name ?? "Home visit"}{s.isDemo ? " · demo" : ""}</p></div>
              <label className="text-xs text-muted">Price (AED)<input name="price" type="number" step="0.01" min="0" defaultValue={o.priceMinor / 100} className="field mt-1" /></label>
              <label className="text-xs text-muted">Min notice (min)<input name="minNoticeMinutes" type="number" min="0" defaultValue={o.minNoticeMinutes} className="field mt-1" /></label>
              <label className="text-xs text-muted">Buffer after (min)<input name="bufferAfterMinutes" type="number" min="0" defaultValue={o.bufferAfterMinutes} className="field mt-1" /></label>
              <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" name="active" defaultChecked={o.active} className="accent-teal" /> Active</label>
            </ActionForm>
          ))}
        </div>
      </Section>
      <Section title="Facilities">
        <div className="grid gap-4">
          {facs.map((f) => {
            const pol = f.cancellationPolicy as { freeCancelHours: number; lateCancelRefundPercent: number };
            return (
              <div key={f.id} className="card p-5">
                <p className="text-xs font-semibold text-brass">{f.status === "verified" ? "Verified" : "Pending verification"}{f.isDemo ? " · demo data" : ""}</p>
                <ActionForm action={pricingAction} submit="Save facility" tone="secondary" className="mt-2 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="op" value="facility" /><input type="hidden" name="id" value={f.id} />
                  <label className="text-xs text-muted">Name<input name="name" defaultValue={f.name} className="field mt-1" /></label>
                  <label className="text-xs text-muted">Address<input name="addressLine" defaultValue={f.addressLine ?? ""} className="field mt-1" /></label>
                  <label className="text-xs text-muted">Licensed legal entity<input name="legalEntityName" defaultValue={f.legalEntityName ?? ""} className="field mt-1" /></label>
                  <label className="text-xs text-muted">DHA facility licence<input name="dhaFacilityLicense" defaultValue={f.dhaFacilityLicense ?? ""} className="field mt-1" /></label>
                  <label className="text-xs text-muted">Confirmation<select name="confirmationMode" defaultValue={f.confirmationMode} className="field mt-1"><option value="manual_staff">Staff confirms each booking</option><option value="auto_on_payment">Auto-confirm on verified payment</option></select></label>
                  <label className="text-xs text-muted">Payment<select name="paymentMode" defaultValue={f.paymentMode} className="field mt-1"><option value="prepay">Prepay online</option><option value="pay_at_facility">Pay at facility</option></select></label>
                  <label className="text-xs text-muted">Capture<select name="captureMode" defaultValue={f.captureMode} className="field mt-1"><option value="on_confirmation">Authorise, capture on confirmation</option><option value="automatic">Capture immediately</option></select></label>
                  <label className="text-xs text-muted">Physician share % (for revenue reports)<input name="physicianSharePercent" type="number" min="0" max="100" defaultValue={f.physicianSharePercent ?? ""} className="field mt-1" /></label>
                  <label className="text-xs text-muted">Free cancellation (hours)<input name="freeCancelHours" type="number" min="0" defaultValue={pol.freeCancelHours} className="field mt-1" /></label>
                  <label className="text-xs text-muted">Late cancellation refund %<input name="lateCancelRefundPercent" type="number" min="0" max="100" defaultValue={pol.lateCancelRefundPercent} className="field mt-1" /></label>
                  <label className="text-xs text-muted sm:col-span-2">Insurance note<input name="insuranceNote" defaultValue={f.insuranceNote ?? ""} className="field mt-1" /></label>
                </ActionForm>
                {f.status !== "verified" && can(user.roles, "settings:compliance") && (
                  <ActionForm action={verifyFacilityAction} submit="Mark facility verified" confirm="Confirm the doctor holds privileges here and the contract permits online booking?" className="mt-4 border-t border-line pt-4">
                    <input type="hidden" name="id" value={f.id} />
                    <input name="evidence" className="field" placeholder="Evidence: privileges letter / contract reference" required />
                  </ActionForm>
                )}
              </div>
            );
          })}
        </div>
      </Section>
      <Section title="Home-visit zones">
        <div className="grid gap-3">
          {zones.map((z) => (
            <ActionForm key={z.id} action={pricingAction} submit="Save" tone="secondary" className="card grid items-end gap-3 p-4 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <input type="hidden" name="op" value="zone" /><input type="hidden" name="id" value={z.id} />
              <p className="font-medium text-ink">{z.name}{z.isDemo ? <span className="text-xs text-muted"> · demo</span> : null}</p>
              <label className="text-xs text-muted">Radius (km)<input name="radiusKm" type="number" step="0.5" defaultValue={z.radiusKm} className="field mt-1" /></label>
              <label className="text-xs text-muted">Surcharge (AED)<input name="surcharge" type="number" step="0.01" defaultValue={z.surchargeMinor / 100} className="field mt-1" /></label>
              <label className="text-xs text-muted">Travel buffer (min)<input name="travelBufferMinutes" type="number" defaultValue={z.travelBufferMinutes} className="field mt-1" /></label>
              <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" name="active" defaultChecked={z.active} className="accent-teal" /> Active</label>
            </ActionForm>
          ))}
        </div>
      </Section>
    </div>
  );
}
