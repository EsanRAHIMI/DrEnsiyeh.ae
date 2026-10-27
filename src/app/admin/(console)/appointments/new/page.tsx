import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, offerings, services } from "@/db/schema";
import { requireStaff } from "@/server/auth/session";
import { PageTitle } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/ActionForm";
import { createStaffBooking } from "../../actions";
import { pickLocalized } from "@/i18n/dictionaries";

export default async function NewAppointment() {
  await requireStaff("appointments:override");
  const rows = await db().select({ o: offerings, s: services, f: facilities }).from(offerings).innerJoin(services, eq(services.id, offerings.serviceId)).leftJoin(facilities, eq(facilities.id, offerings.facilityId));
  return (
    <div className="max-w-2xl">
      <PageTitle title="New appointment" subtitle="For phone or in-person bookings. Bypasses working-hour rules (recorded in the audit log) but never allows overlapping appointments." />
      <ActionForm action={createStaffBooking} submit="Create confirmed appointment" className="card grid gap-4 p-6">
        <label className="field-label" htmlFor="o">Service & location</label>
        <select id="o" name="offeringId" className="field" required>
          {rows.filter((r) => r.s.kind === "clinic").map((r) => <option key={r.o.id} value={r.o.id}>{pickLocalized(r.s.name, "en")} — {r.f?.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label" htmlFor="d">Date</label><input id="d" type="date" name="date" required className="field" /></div>
          <div><label className="field-label" htmlFor="t">Time (Dubai)</label><input id="t" type="time" name="time" step={300} required className="field" /></div>
        </div>
        <div><label className="field-label" htmlFor="n">Patient name</label><input id="n" name="contactName" required className="field" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="field-label" htmlFor="e">Email</label><input id="e" name="contactEmail" type="email" required className="field" /></div>
          <div><label className="field-label" htmlFor="p">Phone</label><input id="p" name="contactPhone" required className="field" /></div>
        </div>
        <div><label className="field-label" htmlFor="r">Override reason</label><input id="r" name="reason" required className="field" placeholder="e.g. booked by phone" /></div>
      </ActionForm>
    </div>
  );
}
