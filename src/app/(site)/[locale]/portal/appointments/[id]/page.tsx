import Link from "next/link";
import { notFound } from "next/navigation";
import { localeFrom } from "@/i18n/server";
import { requirePatient } from "@/server/auth/session";
import { patientBooking } from "@/server/portal";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { fmtDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { pickLocalized } from "@/i18n/dictionaries";
import { AppointmentActions } from "@/components/portal/AppointmentActions";
import { db } from "@/db";
import { facilities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { refundAmountFor } from "@/server/booking/engine";

export default async function Appointment({ params }: PageProps<"/[locale]/portal/appointments/[id]">) {
  const { locale } = await localeFrom(params);
  const { id } = await params;
  const user = await requirePatient(locale);
  const row = await patientBooking(user, id);
  if (!row) notFound();
  const b = row.b;
  const [fac] = b.facilityId ? await db().select().from(facilities).where(eq(facilities.id, b.facilityId)) : [null];
  const policy = (fac?.cancellationPolicy as { freeCancelHours: number; lateCancelRefundPercent: number }) ?? { freeCancelHours: 24, lateCancelRefundPercent: 0 };
  const now = new Date();
  const changeable = ["requested", "awaiting_confirmation", "confirmed"].includes(b.status) && b.startsAt > now;
  const refundNow = b.paymentMode === "prepay" ? refundAmountFor(b, policy, now, "patient") : 0;
  return (
    <div className="space-y-6">
      <Link href={`/${locale}/portal/appointments`} className="text-sm text-teal">← All appointments</Link>
      <div className="card p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-2xl text-ink">{fmtDateTime(b.startsAt)}</h2>
            <p className="mt-1 text-ink-soft">{pickLocalized(row.serviceName, locale)}</p>
          </div>
          <StatusBadge status={b.status} />
        </div>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">Reference</dt><dd className="font-medium text-ink">{b.reference}</dd></div>
          <div><dt className="text-muted">Location</dt><dd className="font-medium text-ink">{b.kind === "home_visit" ? "Home visit" : `${fac?.name ?? ""}${fac?.addressLine ? ` — ${fac.addressLine}` : ""}`}</dd></div>
          <div><dt className="text-muted">Total</dt><dd className="font-medium text-ink">{formatMoney(b.totalMinor, b.currency)} {b.paymentMode === "pay_at_facility" ? "(pay at facility)" : ""}</dd></div>
          <div><dt className="text-muted">Cancellation</dt><dd className="font-medium text-ink">Free until {policy.freeCancelHours}h before</dd></div>
        </dl>
        {b.status === "awaiting_confirmation" || b.status === "requested" ? (
          <p className="mt-6 rounded-xl bg-brass-tint p-4 text-sm text-brass">This appointment is reserved and awaiting confirmation by the facility.</p>
        ) : null}
      </div>
      {changeable && (
        <AppointmentActions locale={locale} bookingId={b.id} offeringId={b.offeringId} refundText={b.paymentMode === "prepay" ? `If you cancel now, ${formatMoney(refundNow, b.currency)} will be refunded.` : "No payment has been taken."} serviceSlug={row.serviceSlug} />
      )}
      {b.status === "completed" && (
        <Link href={`/${locale}/book?kind=${b.kind}&service=follow-up-consultation`} className="btn-primary">Book a follow-up</Link>
      )}
    </div>
  );
}
