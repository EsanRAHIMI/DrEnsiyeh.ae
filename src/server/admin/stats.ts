import "server-only";
import { and, count, eq, gte, inArray, lt, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { adSpend, attributions, bookings, facilities, funnelEvents, offerings, patients, payments, searchMetrics, services } from "@/db/schema";

export type Range = { from: Date; to: Date };

export function rangeFromParams(sp: Record<string, string | string[] | undefined>): Range {
  const to = typeof sp.to === "string" ? new Date(`${sp.to}T23:59:59+04:00`) : new Date();
  const from = typeof sp.from === "string" ? new Date(`${sp.from}T00:00:00+04:00`) : new Date(to.getTime() - 30 * 86400_000);
  return { from, to };
}

const inRange = (col: AnyPgColumn, r: Range) => and(gte(col, r.from), lt(col, r.to));

/** Aggregate KPIs. Never returns patient-level data. */
export async function practiceKpis(r: Range) {
  const d = db();
  const byStatus = await d.select({ status: bookings.status, n: count() }).from(bookings).where(inRange(bookings.createdAt, r)).groupBy(bookings.status);
  const s = Object.fromEntries(byStatus.map((x) => [x.status, x.n])) as Record<string, number>;
  const created = Object.values(s).reduce((a, b) => a + b, 0);
  const real = created - (s.expired ?? 0) - (s.hold ?? 0) - (s.pending_payment ?? 0);

  const funnel = await d.select({ step: funnelEvents.step, n: count() }).from(funnelEvents).where(inRange(funnelEvents.createdAt, r)).groupBy(funnelEvents.step);
  const f = Object.fromEntries(funnel.map((x) => [x.step, x.n])) as Record<string, number>;

  const [pay] = await d
    .select({
      gross: sum(sql`case when ${payments.status} in ('succeeded','refunded','partially_refunded') then ${payments.amountMinor} else 0 end`),
      refunds: sum(payments.amountRefundedMinor),
      fees: sum(payments.feeMinor),
    })
    .from(payments)
    .where(inRange(payments.createdAt, r));

  const revenueByService = await d
    .select({ service: services.slug, kind: services.kind, total: sum(payments.amountMinor), refunded: sum(payments.amountRefundedMinor) })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .innerJoin(offerings, eq(offerings.id, bookings.offeringId))
    .innerJoin(services, eq(services.id, offerings.serviceId))
    .where(and(inRange(payments.createdAt, r), inArray(payments.status, ["succeeded", "refunded", "partially_refunded"])))
    .groupBy(services.slug, services.kind);

  const revenueByFacility = await d
    .select({ facility: sql<string>`coalesce(${facilities.name}, 'Home visits')`, share: facilities.physicianSharePercent, total: sum(payments.amountMinor), refunded: sum(payments.amountRefundedMinor) })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .leftJoin(facilities, eq(facilities.id, bookings.facilityId))
    .where(and(inRange(payments.createdAt, r), inArray(payments.status, ["succeeded", "refunded", "partially_refunded"])))
    .groupBy(facilities.name, facilities.physicianSharePercent);

  const [spend] = await d
    .select({ total: sum(adSpend.spendMinor) })
    .from(adSpend)
    .where(and(gte(adSpend.date, r.from.toISOString().slice(0, 10)), lt(adSpend.date, r.to.toISOString().slice(0, 10))));

  const [newPatients] = await d.select({ n: count() }).from(patients).where(inRange(patients.createdAt, r));
  const repeat = (await d.execute(sql`
    select count(*)::int as n from (
      select patient_id from bookings where patient_id is not null and status in ('confirmed','completed')
      group by patient_id having count(*) > 1) t`)) as unknown as { rows?: unknown[] };

  const [search] = await d
    .select({ impressions: sum(searchMetrics.impressions), clicks: sum(searchMetrics.clicks) })
    .from(searchMetrics)
    .where(and(gte(searchMetrics.date, r.from.toISOString().slice(0, 10)), lt(searchMetrics.date, r.to.toISOString().slice(0, 10))));

  const gross = Number(pay?.gross ?? 0);
  const refunds = Number(pay?.refunds ?? 0);
  const fees = Number(pay?.fees ?? 0);
  const marketing = Number(spend?.total ?? 0);
  // Physician revenue only where the contractual share is configured; otherwise unknown (never assumed).
  let physician = 0;
  let physicianUnknown = false;
  for (const row of revenueByFacility) {
    const net = Number(row.total ?? 0) - Number(row.refunded ?? 0);
    if (row.share == null) physicianUnknown = physicianUnknown || net > 0;
    else physician += Math.round((net * row.share) / 100);
  }
  const completed = s.completed ?? 0;
  return {
    bookings: { created, real, ...s },
    rates: {
      cancellation: real ? (s.cancelled ?? 0) / real : 0,
      noShow: completed + (s.no_show ?? 0) ? (s.no_show ?? 0) / (completed + (s.no_show ?? 0)) : 0,
      bookingStart: f.page_view ? (f.booking_start ?? f.slot_selected ?? 0) / f.page_view : 0,
      checkoutCompletion: f.checkout_started ? ((s.awaiting_confirmation ?? 0) + (s.confirmed ?? 0) + completed) / f.checkout_started : 0,
    },
    funnel: f,
    money: { gross, refunds, fees, net: gross - refunds - fees, marketing, contribution: gross - refunds - fees - marketing, physician, physicianUnknown },
    revenueByService,
    revenueByFacility,
    patients: { new: newPatients.n, repeat: (repeat.rows?.[0] as { n: number } | undefined)?.n ?? 0 },
    search: { impressions: Number(search?.impressions ?? 0), clicks: Number(search?.clicks ?? 0) },
    costPerCompleted: completed ? Math.round(marketing / completed) : null,
  };
}

/** Campaign attribution: aggregate counts only (no patient identifiers). */
export async function campaignReport(r: Range) {
  return db()
    .select({
      source: attributions.source,
      campaign: attributions.campaign,
      visits: sql<number>`count(distinct ${attributions.id})::int`,
      bookings: sql<number>`count(distinct ${bookings.id}) filter (where ${bookings.status} in ('requested','awaiting_confirmation','confirmed','completed'))::int`,
      completed: sql<number>`count(distinct ${bookings.id}) filter (where ${bookings.status} = 'completed')::int`,
      revenue: sql<number>`coalesce(sum(${bookings.totalMinor}) filter (where ${bookings.status} in ('confirmed','completed')),0)::int`,
    })
    .from(attributions)
    .leftJoin(bookings, eq(bookings.attributionId, attributions.id))
    .where(inRange(attributions.createdAt, r))
    .groupBy(attributions.source, attributions.campaign)
    .orderBy(sql`3 desc`);
}
