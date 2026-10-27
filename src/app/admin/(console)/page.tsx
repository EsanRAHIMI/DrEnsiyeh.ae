import Link from "next/link";
import { and, asc, eq, gte, inArray, lt, count } from "drizzle-orm";
import { db } from "@/db";
import { bookings, facilities, notifications, calendarConnections, editorialTasks } from "@/db/schema";
import { requireStaff } from "@/server/auth/session";
import { can } from "@/lib/rbac";
import { PageTitle, Section, Stat, Table } from "@/components/admin/ui";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { fmtDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { practiceKpis } from "@/server/admin/stats";
import { getCompliance, capabilityBlockers } from "@/server/compliance";

export default async function Dashboard({ searchParams }: PageProps<"/admin">) {
  const user = await requireStaff();
  const sp = await searchParams;
  const d = db();
  const now = new Date();
  const startOfDay = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(now)}T00:00:00+04:00`);
  const in7 = new Date(startOfDay.getTime() + 7 * 86400_000);
  const endOfDay = new Date(startOfDay.getTime() + 86400_000);

  const showAppointments = can(user.roles, "appointments:read");
  const [today, upcoming, pending, failedNotifs, calErrors, reviewTasks, compliance] = await Promise.all([
    showAppointments
      ? d.select({ b: bookings, facility: facilities.name }).from(bookings).leftJoin(facilities, eq(facilities.id, bookings.facilityId)).where(and(gte(bookings.startsAt, startOfDay), lt(bookings.startsAt, endOfDay), inArray(bookings.status, ["requested", "awaiting_confirmation", "confirmed", "completed", "no_show"]))).orderBy(asc(bookings.startsAt))
      : [],
    showAppointments ? d.select({ n: count() }).from(bookings).where(and(gte(bookings.startsAt, endOfDay), lt(bookings.startsAt, in7), inArray(bookings.status, ["requested", "awaiting_confirmation", "confirmed"]))) : [{ n: 0 }],
    showAppointments ? d.select({ b: bookings }).from(bookings).where(inArray(bookings.status, ["requested", "awaiting_confirmation"])).orderBy(asc(bookings.startsAt)).limit(20) : [],
    d.select({ n: count() }).from(notifications).where(eq(notifications.status, "failed")),
    d.select({ n: count() }).from(calendarConnections).where(eq(calendarConnections.status, "error")),
    can(user.roles, "content:medical_approve") ? d.select({ n: count() }).from(editorialTasks).where(eq(editorialTasks.status, "open")) : [{ n: 0 }],
    getCompliance(d),
  ]);
  const kpis = can(user.roles, "revenue:read") || can(user.roles, "analytics:read") ? await practiceKpis({ from: new Date(now.getTime() - 30 * 86400_000), to: now }) : null;

  const blockers = (["payments_live", "home_visits", "emr_reference", "whatsapp_live"] as const).map((c) => ({ c, b: capabilityBlockers(compliance, c) })).filter((x) => x.b.length);

  return (
    <div>
      <PageTitle title="Dashboard" subtitle={new Intl.DateTimeFormat("en-AE", { dateStyle: "full", timeZone: "Asia/Dubai" }).format(now)}>
        {can(user.roles, "appointments:manage") && <Link href="/admin/appointments/new" className="btn-primary min-h-10 text-sm">New appointment</Link>}
      </PageTitle>
      {sp.denied && <p role="alert" className="mb-4 rounded-xl bg-alert-tint p-3 text-sm text-alert">You don&apos;t have access to that area.</p>}

      {(failedNotifs[0].n > 0 || calErrors[0].n > 0) && (
        <div role="alert" className="mb-6 rounded-xl bg-alert-tint p-4 text-sm text-alert">
          {failedNotifs[0].n > 0 && <p>{failedNotifs[0].n} notification(s) failed delivery — check Settings → Notifications.</p>}
          {calErrors[0].n > 0 && <p>Google Calendar sync is failing — reconnect in Settings.</p>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {showAppointments && <Stat label="Today" value={today.filter((t) => t.b.status !== "no_show").length} hint={`${today.filter((t) => t.b.kind === "home_visit").length} home visits`} />}
        {showAppointments && <Stat label="Next 7 days" value={upcoming[0].n} />}
        {showAppointments && <Stat label="Awaiting confirmation" value={pending.length} />}
        {kpis && can(user.roles, "revenue:read") && <Stat label="Gross payments (30d)" value={formatMoney(kpis.money.gross)} hint={`Refunds ${formatMoney(kpis.money.refunds)}`} />}
        {kpis && !can(user.roles, "revenue:read") && <Stat label="Bookings (30d)" value={kpis.bookings.real} />}
        {reviewTasks[0].n > 0 && <Stat label="Editorial reviews due" value={reviewTasks[0].n} />}
      </div>

      {showAppointments && (
        <Section title="Today's appointments">
          <Table head={["Time", "Ref", "Type", "Location", "Status", ""]} empty={today.length === 0}>
            {today.map(({ b, facility }) => (
              <tr key={b.id}>
                <td className="p-3 whitespace-nowrap">{fmtDateTime(b.startsAt).split(", ").pop()}</td>
                <td className="p-3">{b.reference}</td>
                <td className="p-3">{b.kind === "home_visit" ? "Home visit" : "Clinic"}</td>
                <td className="p-3">{facility ?? "Patient's home"}</td>
                <td className="p-3"><StatusBadge status={b.status} /></td>
                <td className="p-3"><Link className="text-teal underline" href={`/admin/appointments/${b.id}`}>Open</Link></td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {showAppointments && pending.length > 0 && (
        <Section title="Pending confirmations">
          <Table head={["When", "Ref", "Status", ""]}>
            {pending.map(({ b }) => (
              <tr key={b.id}>
                <td className="p-3">{fmtDateTime(b.startsAt)}</td>
                <td className="p-3">{b.reference}</td>
                <td className="p-3"><StatusBadge status={b.status} /></td>
                <td className="p-3"><Link className="text-teal underline" href={`/admin/appointments/${b.id}`}>Review</Link></td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {can(user.roles, "settings:compliance") || can(user.roles, "appointments:override") ? (
        blockers.length > 0 && (
          <Section title="Regulated features awaiting authorisation">
            <ul className="space-y-2 text-sm">
              {blockers.map(({ c, b }) => (
                <li key={c} className="card p-4">
                  <p className="font-semibold text-ink">{c.replace("_", " ")}</p>
                  <ul className="mt-1 list-disc ps-5 text-ink-soft">{b.map((x) => <li key={x}>{x}</li>)}</ul>
                </li>
              ))}
            </ul>
          </Section>
        )
      ) : null}
    </div>
  );
}
