import { requireStaff } from "@/server/auth/session";
import { can } from "@/lib/rbac";
import { PageTitle, Section, Stat, Table } from "@/components/admin/ui";
import { campaignReport, practiceKpis, rangeFromParams } from "@/server/admin/stats";
import { formatMoney } from "@/lib/money";
import { ActionForm } from "@/components/admin/ActionForm";
import { importAdSpend } from "./actions";
import { ExportCsv } from "@/components/admin/ExportCsv";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default async function Analytics({ searchParams }: PageProps<"/admin/analytics">) {
  const user = await requireStaff("analytics:read");
  const sp = await searchParams;
  const r = rangeFromParams(sp);
  const [k, campaigns] = await Promise.all([practiceKpis(r), campaignReport(r)]);
  const money = can(user.roles, "revenue:read");
  const funnelSteps = ["page_view", "booking_start", "slot_selected", "checkout_started", "booking_completed"] as const;
  return (
    <div>
      <PageTitle title="Acquisition & revenue" subtitle="Aggregate, first-party, consent-based. No patient-level or medical data is used for marketing.">
        <form className="flex gap-2">
          <input type="date" name="from" defaultValue={r.from.toISOString().slice(0, 10)} className="field" aria-label="From" />
          <input type="date" name="to" defaultValue={r.to.toISOString().slice(0, 10)} className="field" aria-label="To" />
          <button className="btn-secondary">Apply</button>
        </form>
      </PageTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Visitors (consented)" value={k.funnel.page_view ?? 0} />
        <Stat label="Organic impressions / clicks" value={`${k.search.impressions} / ${k.search.clicks}`} />
        <Stat label="Bookings (real)" value={k.bookings.real} hint={`${k.bookings.completed} completed`} />
        <Stat label="New / repeat patients" value={`${k.patients.new} / ${k.patients.repeat}`} />
        <Stat label="Booking start rate" value={pct(k.rates.bookingStart)} />
        <Stat label="Checkout completion" value={pct(k.rates.checkoutCompletion)} />
        <Stat label="Cancellation rate" value={pct(k.rates.cancellation)} />
        <Stat label="No-show rate" value={pct(k.rates.noShow)} />
      </div>

      {money && (
        <Section title="Financials">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Gross payment volume" value={formatMoney(k.money.gross)} hint="Total collected — not personal income" />
            <Stat label="Refunds" value={formatMoney(k.money.refunds)} />
            <Stat label="Processing fees" value={formatMoney(k.money.fees)} />
            <Stat label="Marketing spend" value={formatMoney(k.money.marketing)} />
            <Stat label="Physician revenue" value={k.money.physicianUnknown ? "Share not configured" : formatMoney(k.money.physician)} hint="Per facility contract share" />
            <Stat label="Net operating contribution" value={formatMoney(k.money.contribution)} hint="Gross − refunds − fees − marketing" />
            <Stat label="Cost per completed appointment" value={k.costPerCompleted != null ? formatMoney(k.costPerCompleted) : "—"} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Table head={["Service", "Type", "Collected", "Refunded"]} empty={k.revenueByService.length === 0}>
              {k.revenueByService.map((x) => <tr key={x.service}><td className="p-3">{x.service}</td><td className="p-3">{x.kind}</td><td className="p-3">{formatMoney(Number(x.total ?? 0))}</td><td className="p-3">{formatMoney(Number(x.refunded ?? 0))}</td></tr>)}
            </Table>
            <Table head={["Facility", "Collected", "Physician share"]} empty={k.revenueByFacility.length === 0}>
              {k.revenueByFacility.map((x) => <tr key={x.facility}><td className="p-3">{x.facility}</td><td className="p-3">{formatMoney(Number(x.total ?? 0))}</td><td className="p-3">{x.share != null ? `${x.share}%` : "not set"}</td></tr>)}
            </Table>
          </div>
        </Section>
      )}

      <Section title="Booking funnel">
        <ol className="grid gap-2 sm:grid-cols-5">
          {funnelSteps.map((s) => <li key={s} className="card p-4 text-sm"><p className="text-muted">{s.replace(/_/g, " ")}</p><p className="mt-1 text-xl font-semibold tabular-nums">{k.funnel[s] ?? 0}</p></li>)}
        </ol>
      </Section>

      <Section title="Campaigns" actions={<ExportCsv filename="campaigns.csv" rows={campaigns.map((c) => ({ source: c.source ?? "", campaign: c.campaign ?? "", visits: c.visits, bookings: c.bookings, completed: c.completed, revenue_aed: (c.revenue / 100).toFixed(2) }))} />}>
        <Table head={["Source", "Campaign", "Visits", "Bookings", "Completed", money ? "Booked value" : ""]} empty={campaigns.length === 0}>
          {campaigns.map((c, i) => <tr key={i}><td className="p-3">{c.source ?? "(direct)"}</td><td className="p-3">{c.campaign ?? "—"}</td><td className="p-3">{c.visits}</td><td className="p-3">{c.bookings}</td><td className="p-3">{c.completed}</td><td className="p-3">{money ? formatMoney(c.revenue) : ""}</td></tr>)}
        </Table>
      </Section>

      {money && (
        <Section title="Import advertising cost">
          <ActionForm action={importAdSpend} submit="Import CSV" tone="secondary" okText="Imported">
            <textarea name="csv" className="field min-h-28 py-3 font-mono text-xs" placeholder={"platform,campaign,date,spend_aed,impressions,clicks\ngoogle,id-consult-dubai,2026-10-20,350.00,5400,210"} />
          </ActionForm>
          <p className="mt-2 text-xs text-muted">Direct API imports (Google Ads, Meta, LinkedIn, TikTok, Snapchat) can populate the same table once account access is authorised. No patient data is sent to ad platforms.</p>
        </Section>
      )}
    </div>
  );
}
