import { desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { calendarConnections, notifications, users } from "@/db/schema";
import { requireStaff } from "@/server/auth/session";
import { can } from "@/lib/rbac";
import { PageTitle, Section, Table } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/ActionForm";
import { complianceAction, disableUserAction, userRoleAction } from "../actions";
import { capabilityBlockers, getCompliance } from "@/server/compliance";
import { fmtDateTime } from "@/lib/format";

const ROLES = ["doctor", "practice_admin", "reception", "content_editor", "finance", "tech_admin"] as const;

export default async function Settings() {
  const user = await requireStaff("settings:compliance");
  const [c, staff, cal, notifStats, failed] = await Promise.all([
    getCompliance(db()),
    db().select().from(users).where(ne(sql`array_to_string(${users.roles}, ',')`, "patient")),
    db().select().from(calendarConnections),
    db().select({ status: notifications.status, n: sql<number>`count(*)::int` }).from(notifications).groupBy(notifications.status),
    db().select().from(notifications).where(eq(notifications.status, "failed")).orderBy(desc(notifications.updatedAt)).limit(20),
  ]);
  const caps = (["payments_test", "payments_live", "home_visits", "emr_reference", "emr_native", "whatsapp_live"] as const).map((k) => ({ k, b: capabilityBlockers(c, k) }));
  return (
    <div className="max-w-5xl">
      <PageTitle title="Settings & compliance" />
      <Section title="Regulated capabilities">
        <ul className="grid gap-2 sm:grid-cols-2">
          {caps.map(({ k, b }) => (
            <li key={k} className={`card p-4 text-sm ${b.length ? "" : "border-ok/40"}`}>
              <p className="font-semibold text-ink">{k.replace(/_/g, " ")} — {b.length ? <span className="text-brass">blocked</span> : <span className="text-ok">authorised</span>}</p>
              {b.length > 0 && <ul className="mt-1 list-disc ps-5 text-ink-soft">{b.map((x) => <li key={x}>{x}</li>)}</ul>}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Operating model">
        <ActionForm action={complianceAction} submit="Save operating model" className="card grid gap-4 p-5 sm:grid-cols-2">
          {([
            ["serviceProviderEntity", "Licensed service-provider entity", c.serviceProviderEntity],
            ["merchantOfRecord", "Merchant of record (legal entity)", c.merchantOfRecord],
            ["stripeAccountOwnerEntity", "Stripe account owner (legal entity)", c.stripeAccountOwnerEntity],
            ["recordsCustodian", "Medical-records custodian", c.recordsCustodian],
            ["dhaAdvertisingPermitRef", "DHA advertising permit reference", c.dhaAdvertisingPermitRef],
            ["homeHealthcareAuthorizationRef", "DHA home-healthcare authorisation ref.", c.homeHealthcareAuthorizationRef],
          ] as const).map(([name, label, v]) => (
            <label key={name} className="text-xs text-muted">{label}<input name={name} defaultValue={v ?? ""} className="field mt-1" /></label>
          ))}
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="facilityContractPermitsExternalBooking" defaultChecked={c.facilityContractPermitsExternalBooking} className="accent-teal" /> Facility contract(s) permit external online booking and payment collection</label>
          <label className="text-xs text-muted">Payments<select name="paymentsMode" defaultValue={c.paymentsMode} className="field mt-1"><option value="disabled">Disabled (requests only)</option><option value="test">Stripe test mode</option><option value="live">Live</option></select></label>
          <label className="text-xs text-muted">Home visits<select name="homeVisitsMode" defaultValue={c.homeVisitsMode} className="field mt-1"><option value="disabled">Disabled</option><option value="waitlist">Waitlist</option><option value="enabled">Enabled</option></select></label>
          <label className="text-xs text-muted">Clinical records<select name="emrMode" defaultValue={c.emrMode} className="field mt-1"><option value="disabled">Disabled</option><option value="document_reference">Summaries + facility EMR references</option><option value="native">Structured records (native)</option></select></label>
          <label className="text-xs text-muted">WhatsApp<select name="whatsappMode" defaultValue={c.whatsappMode} className="field mt-1"><option value="disabled">Disabled</option><option value="sandbox">Sandbox</option><option value="live">Live</option></select></label>
          <label className="text-xs text-muted">Insurance billing<select name="insuranceBilling" defaultValue={c.insuranceBilling} className="field mt-1"><option value="excluded">Excluded (self-pay)</option><option value="supported">Supported</option></select></label>
          <label className="text-xs text-muted">Approval reference (required when changing a mode)<input name="approvalReference" className="field mt-1" placeholder="e.g. DHA letter 2026/123, contract §4.2" /></label>
        </ActionForm>
        {c.approvals.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted">{c.approvals.map((a, i) => <li key={i}>{a.recordedAt.slice(0, 10)} · {a.capability} · {a.reference} · {a.approvedBy}</li>)}</ul>
        )}
      </Section>

      <Section title="Google Calendar">
        {cal.length === 0 ? <p className="text-sm text-ink-soft">Not connected.</p> : (
          <ul className="space-y-2 text-sm">{cal.map((k) => <li key={k.id} className="card p-4">{k.googleAccountEmail} · {k.status} · last sync {k.lastSyncAt ? fmtDateTime(k.lastSyncAt) : "never"}{k.lastError ? <span className="block text-alert">{k.lastError}</span> : null}</li>)}</ul>
        )}
        {can(user.roles, "settings:integrations") && (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth redirect endpoint, must be a full navigation
          <a href="/api/v1/calendar/oauth/start" className="btn-secondary mt-3 min-h-10 text-sm">{cal.length ? "Reconnect" : "Connect"} Google Calendar</a>
        )}
      </Section>

      <Section title="Notifications">
        <p className="text-sm text-ink-soft">{notifStats.map((s) => `${s.status}: ${s.n}`).join(" · ") || "No notifications yet."}</p>
        {failed.length > 0 && (
          <Table head={["When", "Channel", "Template", "Error"]}>
            {failed.map((n) => <tr key={n.id}><td className="p-3">{fmtDateTime(n.updatedAt)}</td><td className="p-3">{n.channel}</td><td className="p-3">{n.template}</td><td className="p-3 text-xs">{n.lastError}</td></tr>)}
          </Table>
        )}
      </Section>

      {can(user.roles, "users:manage") && (
        <Section title="Staff accounts">
          <Table head={["Email", "Roles", "MFA", "Status", ""]}>
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="p-3">{s.email}</td><td className="p-3">{s.roles.join(", ")}</td><td className="p-3">{s.totpEnabledAt ? "On" : "Not enrolled"}</td><td className="p-3">{s.disabledAt ? "Disabled" : "Active"}</td>
                <td className="p-3">{!s.disabledAt && s.id !== user.userId && <ActionForm action={disableUserAction} submit="Disable" tone="secondary" confirm="Disable this account?"><input type="hidden" name="userId" value={s.id} /></ActionForm>}</td>
              </tr>
            ))}
          </Table>
          <ActionForm action={userRoleAction} submit="Grant roles" className="card mt-4 grid gap-3 p-5">
            <input name="email" type="email" required className="field" placeholder="staff@example.com" />
            <div className="flex flex-wrap gap-4 text-sm">{ROLES.map((r) => <label key={r} className="flex gap-2"><input type="checkbox" name="roles" value={r} className="accent-teal" /> {r.replace("_", " ")}</label>)}</div>
            <p className="text-xs text-muted">Staff sign in with an email code and must enrol an authenticator app on first sign-in.</p>
          </ActionForm>
        </Section>
      )}
    </div>
  );
}
