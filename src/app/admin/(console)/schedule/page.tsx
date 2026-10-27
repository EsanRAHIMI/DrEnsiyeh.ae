import { asc, gte } from "drizzle-orm";
import { db } from "@/db";
import { availabilityExceptions, availabilityRules, facilities, providers } from "@/db/schema";
import { requireStaff } from "@/server/auth/session";
import { PageTitle, Section, Table } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/ActionForm";
import { scheduleAction } from "../actions";
import { fmtDateTime } from "@/lib/format";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function Schedule() {
  await requireStaff("availability:manage");
  const [provs, facs, rules, blocks] = await Promise.all([
    db().select().from(providers),
    db().select().from(facilities),
    db().select().from(availabilityRules).orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startTime)),
    db().select().from(availabilityExceptions).where(gte(availabilityExceptions.endsAt, new Date())).orderBy(asc(availabilityExceptions.startsAt)),
  ]);
  const provider = provs[0];
  const facName = (id: string | null) => facs.find((f) => f.id === id)?.name ?? "Home visits";
  if (!provider) return <PageTitle title="Schedule" subtitle="No provider configured — run the seed." />;
  return (
    <div className="max-w-5xl">
      <PageTitle title="Schedule" subtitle="Weekly working hours per location (Dubai time). External calendar busy times and existing appointments are subtracted automatically." />
      <Table head={["Day", "Location", "Hours", "Slot step", ""]} empty={rules.length === 0}>
        {rules.map((r) => (
          <tr key={r.id}>
            <td className="p-3">{DAYS[r.weekday]}</td>
            <td className="p-3">{r.kind === "home_visit" ? "Home visits" : facName(r.facilityId)}</td>
            <td className="p-3 tabular-nums">{r.startTime}–{r.endTime}</td>
            <td className="p-3">{r.slotStepMinutes} min</td>
            <td className="p-3"><ActionForm action={scheduleAction} submit="Remove" tone="secondary" confirm="Remove these hours?"><input type="hidden" name="op" value="delete_rule" /><input type="hidden" name="id" value={r.id} /></ActionForm></td>
          </tr>
        ))}
      </Table>
      <Section title="Add working hours">
        <ActionForm action={scheduleAction} submit="Add" className="card grid gap-3 p-5 sm:grid-cols-6">
          <input type="hidden" name="op" value="add_rule" /><input type="hidden" name="providerId" value={provider.id} />
          <select name="weekday" className="field" aria-label="Day">{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
          <select name="kind" className="field" aria-label="Type"><option value="clinic">Clinic</option><option value="home_visit">Home visits</option></select>
          <select name="facilityId" className="field" aria-label="Facility">{facs.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          <input type="time" name="startTime" required className="field" aria-label="Start" />
          <input type="time" name="endTime" required className="field" aria-label="End" />
          <select name="slotStepMinutes" className="field" aria-label="Step" defaultValue="15"><option>10</option><option>15</option><option>20</option><option>30</option><option>60</option></select>
        </ActionForm>
      </Section>
      <Section title="Time off & blocks">
        <Table head={["From", "To", "Reason", ""]} empty={blocks.length === 0}>
          {blocks.map((b) => (
            <tr key={b.id}><td className="p-3">{fmtDateTime(b.startsAt)}</td><td className="p-3">{fmtDateTime(b.endsAt)}</td><td className="p-3">{b.reason}</td>
              <td className="p-3"><ActionForm action={scheduleAction} submit="Remove" tone="secondary"><input type="hidden" name="op" value="delete_block" /><input type="hidden" name="id" value={b.id} /></ActionForm></td></tr>
          ))}
        </Table>
        <ActionForm action={scheduleAction} submit="Block time" className="card mt-4 grid gap-3 p-5 sm:grid-cols-4">
          <input type="hidden" name="op" value="add_block" /><input type="hidden" name="providerId" value={provider.id} />
          <input type="date" name="date" required className="field" aria-label="Date" />
          <input type="time" name="from" required className="field" aria-label="From" />
          <input type="time" name="to" required className="field" aria-label="To" />
          <input name="reason" className="field" placeholder="Reason (internal)" />
        </ActionForm>
      </Section>
    </div>
  );
}
