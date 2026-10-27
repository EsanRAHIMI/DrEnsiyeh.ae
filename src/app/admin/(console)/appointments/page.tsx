import Link from "next/link";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { bookings, facilities } from "@/db/schema";
import { requireStaff } from "@/server/auth/session";
import { PageTitle, Table } from "@/components/admin/ui";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { fmtDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";

function listRange(sp: Record<string, string | string[] | undefined>) {
  const now = Date.now();
  return {
    from: typeof sp.from === "string" ? new Date(`${sp.from}T00:00:00+04:00`) : new Date(now - 86400_000),
    to: typeof sp.to === "string" ? new Date(`${sp.to}T23:59:59+04:00`) : new Date(now + 30 * 86400_000),
  };
}

const STATUSES = ["requested", "awaiting_confirmation", "confirmed", "completed", "cancelled", "no_show", "pending_payment", "expired"] as const;

export default async function Appointments({ searchParams }: PageProps<"/admin/appointments">) {
  await requireStaff("appointments:read");
  const sp = await searchParams;
  const { from, to } = listRange(sp);
  const status = typeof sp.status === "string" && (STATUSES as readonly string[]).includes(sp.status) ? [sp.status as (typeof STATUSES)[number]] : ["requested", "awaiting_confirmation", "confirmed", "completed", "no_show"] as (typeof STATUSES)[number][];
  const kind = sp.kind === "home_visit" || sp.kind === "clinic" ? sp.kind : null;
  const rows = await db()
    .select({ b: bookings, facility: facilities.name })
    .from(bookings)
    .leftJoin(facilities, eq(facilities.id, bookings.facilityId))
    .where(and(gte(bookings.startsAt, from), lt(bookings.startsAt, to), inArray(bookings.status, status), kind ? eq(bookings.kind, kind) : undefined))
    .orderBy(asc(bookings.startsAt))
    .limit(500);
  return (
    <div>
      <PageTitle title="Appointments">
        <Link href="/admin/appointments/new" className="btn-primary min-h-10 text-sm">New appointment</Link>
      </PageTitle>
      <form className="card mb-5 grid gap-3 p-4 sm:grid-cols-5">
        <input type="date" name="from" defaultValue={typeof sp.from === "string" ? sp.from : ""} className="field" aria-label="From" />
        <input type="date" name="to" defaultValue={typeof sp.to === "string" ? sp.to : ""} className="field" aria-label="To" />
        <select name="status" defaultValue={typeof sp.status === "string" ? sp.status : ""} className="field" aria-label="Status">
          <option value="">Active & recent</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <select name="kind" defaultValue={kind ?? ""} className="field" aria-label="Type"><option value="">All types</option><option value="clinic">Clinic</option><option value="home_visit">Home visit</option></select>
        <button className="btn-secondary">Filter</button>
      </form>
      <Table head={["When", "Ref", "Patient", "Type", "Location", "Total", "Status", ""]} empty={rows.length === 0}>
        {rows.map(({ b, facility }) => (
          <tr key={b.id}>
            <td className="p-3 whitespace-nowrap">{fmtDateTime(b.startsAt)}</td>
            <td className="p-3">{b.reference}</td>
            <td className="p-3">{b.contactName}</td>
            <td className="p-3">{b.kind === "home_visit" ? "Home" : "Clinic"}</td>
            <td className="p-3">{facility ?? "—"}</td>
            <td className="p-3 tabular-nums">{formatMoney(b.totalMinor, b.currency)}</td>
            <td className="p-3"><StatusBadge status={b.status} /></td>
            <td className="p-3"><Link className="text-teal underline" href={`/admin/appointments/${b.id}`}>Open</Link></td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
