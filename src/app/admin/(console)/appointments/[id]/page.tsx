import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookingEvents, bookings, facilities, payments, offerings, services } from "@/db/schema";
import { requireStaff } from "@/server/auth/session";
import { can } from "@/lib/rbac";
import { PageTitle, Section, Table } from "@/components/admin/ui";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { fmtDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { ActionForm } from "@/components/admin/ActionForm";
import { appointmentAction, refundAction } from "../../actions";
import { decryptJson } from "@/lib/crypto";
import { pickLocalized } from "@/i18n/dictionaries";
import { audit } from "@/server/audit";

export default async function AppointmentDetail({ params }: PageProps<"/admin/appointments/[id]">) {
  const user = await requireStaff("appointments:read");
  const { id } = await params;
  const [row] = await db()
    .select({ b: bookings, facility: facilities, service: services })
    .from(bookings)
    .leftJoin(facilities, eq(facilities.id, bookings.facilityId))
    .innerJoin(offerings, eq(offerings.id, bookings.offeringId))
    .innerJoin(services, eq(services.id, offerings.serviceId))
    .where(eq(bookings.id, id));
  if (!row) notFound();
  const { b, facility, service } = row;
  const [events, pays] = await Promise.all([
    db().select().from(bookingEvents).where(eq(bookingEvents.bookingId, id)).orderBy(asc(bookingEvents.createdAt)),
    can(user.roles, "payments:read") ? db().select().from(payments).where(eq(payments.bookingId, id)) : [],
  ]);
  const showContact = can(user.roles, "patients:read_contact");
  const home = b.homeAddressEnc && showContact ? decryptJson<{ address: string; accessNotes: string }>(b.homeAddressEnc) : null;
  if (home) await audit(db(), { userId: user.userId, role: user.roles.join(","), type: "staff" }, "booking.view_address", "booking", b.id);
  const manage = can(user.roles, "appointments:manage");
  const hidden = (op: string) => (
    <>
      <input type="hidden" name="bookingId" value={b.id} />
      <input type="hidden" name="op" value={op} />
    </>
  );
  return (
    <div className="max-w-4xl">
      <Link href="/admin/appointments" className="text-sm text-teal">← Appointments</Link>
      <PageTitle title={`${b.reference} · ${fmtDateTime(b.startsAt)}`} subtitle={`${pickLocalized(service.name, "en")} · ${b.kind === "home_visit" ? "Home visit" : facility?.name}`}>
        <StatusBadge status={b.status} />
      </PageTitle>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5 text-sm">
          <h2 className="font-semibold text-ink">Patient contact</h2>
          {showContact ? (
            <dl className="mt-3 space-y-1.5">
              <div><dt className="inline text-muted">Name: </dt><dd className="inline">{b.contactName}</dd></div>
              <div><dt className="inline text-muted">Email: </dt><dd className="inline">{b.contactEmail}</dd></div>
              <div><dt className="inline text-muted">Phone: </dt><dd className="inline">{b.contactPhone}</dd></div>
              {home && <div><dt className="text-muted">Home address</dt><dd>{home.address}{home.accessNotes && <span className="block text-ink-soft">Access: {home.accessNotes}</span>}</dd></div>}
            </dl>
          ) : (
            <p className="mt-2 text-muted">Not available for your role.</p>
          )}
          {b.patientId && can(user.roles, "patients:read_contact") && <Link className="mt-3 inline-block text-teal underline" href={`/admin/patients/${b.patientId}`}>Patient record</Link>}
        </div>
        <div className="card p-5 text-sm">
          <h2 className="font-semibold text-ink">Booking</h2>
          <dl className="mt-3 space-y-1.5">
            <div><dt className="inline text-muted">Total: </dt><dd className="inline">{formatMoney(b.totalMinor, b.currency)} ({b.paymentMode === "prepay" ? "prepaid" : "pay at facility"})</dd></div>
            <div><dt className="inline text-muted">Occupies: </dt><dd className="inline">{fmtDateTime(b.blockStartsAt)} → {fmtDateTime(b.blockEndsAt).split(", ").pop()}</dd></div>
            <div><dt className="inline text-muted">Created: </dt><dd className="inline">{fmtDateTime(b.createdAt)}</dd></div>
          </dl>
        </div>
      </div>

      {manage && (
        <Section title="Actions">
          <div className="grid gap-4 sm:grid-cols-2">
            {(b.status === "requested" || b.status === "awaiting_confirmation") && (
              <div className="card p-5">
                <p className="text-sm text-ink-soft">Confirm once the facility has accepted this appointment.{b.status === "awaiting_confirmation" ? " The authorised payment will be captured." : ""}</p>
                <ActionForm action={appointmentAction} submit="Confirm appointment" okText="Confirmed">{hidden("confirm")}</ActionForm>
                <ActionForm action={appointmentAction} submit="Decline & refund" tone="danger" confirm="Decline this appointment? Any payment is released or refunded in full." className="mt-2">
                  {hidden("decline")}
                  <input name="reason" className="field mt-2" placeholder="Reason (internal)" aria-label="Cancellation reason (internal)" />
                </ActionForm>
              </div>
            )}
            {b.status === "confirmed" && (
              <div className="card p-5">
                <ActionForm action={appointmentAction} submit="Mark completed">{hidden("complete")}</ActionForm>
                <ActionForm action={appointmentAction} submit="Mark no-show" tone="secondary" className="mt-2">{hidden("no_show")}</ActionForm>
              </div>
            )}
            {["requested", "awaiting_confirmation", "confirmed"].includes(b.status) && (
              <div className="card p-5">
                <p className="text-sm font-medium text-ink">Reschedule</p>
                <ActionForm action={appointmentAction} submit="Move appointment" tone="secondary">
                  {hidden("reschedule")}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input type="date" name="date" required className="field" />
                    <input type="time" name="time" required step={900} className="field" />
                  </div>
                </ActionForm>
                <ActionForm action={appointmentAction} submit="Cancel (full refund)" tone="danger" confirm="Cancel and fully refund this appointment?" className="mt-4">
                  {hidden("cancel")}
                  <input name="reason" className="field mt-2" placeholder="Reason (internal)" aria-label="Cancellation reason (internal)" />
                </ActionForm>
              </div>
            )}
          </div>
        </Section>
      )}

      {pays.length > 0 && (
        <Section title="Payments">
          <Table head={["Created", "Status", "Amount", "Refunded", "Mode", ""]}>
            {pays.map((p) => (
              <tr key={p.id}>
                <td className="p-3">{fmtDateTime(p.createdAt)}</td>
                <td className="p-3">{p.status}</td>
                <td className="p-3 tabular-nums">{formatMoney(p.amountMinor, p.currency)}</td>
                <td className="p-3 tabular-nums">{formatMoney(p.amountRefundedMinor, p.currency)}</td>
                <td className="p-3">{p.livemode ? "Live" : "Test"}</td>
                <td className="p-3">
                  {can(user.roles, "payments:refund") && ["succeeded", "partially_refunded"].includes(p.status) && (
                    <ActionForm action={refundAction} submit="Refund" tone="secondary" confirm="Issue this refund?">
                      <input type="hidden" name="paymentId" value={p.id} />
                      <input name="amount" type="number" step="0.01" min="0.01" max={(p.amountMinor - p.amountRefundedMinor) / 100} defaultValue={(p.amountMinor - p.amountRefundedMinor) / 100} className="field w-32" aria-label="Refund amount (AED)" />
                      <input name="reason" className="field mt-2" placeholder="Reason" aria-label="Refund reason" />
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      <Section title="History">
        <ol className="space-y-2 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="w-40 shrink-0 text-muted">{fmtDateTime(e.createdAt)}</span>
              <span>{e.fromStatus ? `${e.fromStatus} → ` : ""}<strong>{e.toStatus}</strong> <span className="text-muted">by {e.actorType}</span>{e.note ? ` — ${e.note}` : ""}</span>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
