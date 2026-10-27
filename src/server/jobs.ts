import { and, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { articles, bookings, editorialTasks, payments } from "@/db/schema";
import { expireStaleHolds, onCheckoutExpired, onCheckoutPaid, type Deps } from "@/server/booking/engine";
import { processOutbox, enqueue } from "@/server/notifications/outbox";
import { defaultAdapters } from "@/server/notifications/channels";
import { capabilityBlockers } from "@/server/compliance";
import { syncCalendar } from "@/server/calendar/google";
import { stripe } from "@/server/payments/gateway";
import { formatInTimeZone } from "date-fns-tz";
import { crawlSite } from "@/server/seo/audit";
import { importSearchConsole } from "@/server/seo/search-console";

export const JOBS = ["holds", "notifications", "calendar", "reconcile", "content", "daily-summary", "seo-crawl", "search-console"] as const;
export type Job = (typeof JOBS)[number];

export async function runJob(job: Job, deps: Deps) {
  const now = new Date();
  switch (job) {
    case "holds":
      return { expired: await expireStaleHolds(deps.db, now) };
    case "notifications":
      return processOutbox(deps.db, defaultAdapters(capabilityBlockers(deps.compliance, "whatsapp_live").length === 0), now);
    case "calendar":
      return syncCalendar(deps.db, deps.baseUrl);
    case "reconcile":
      return reconcilePayments(deps);
    case "content":
      return contentMaintenance(deps.db, now);
    case "daily-summary":
      return dailySummary(deps, now);
    case "seo-crawl":
      return crawlSite(deps.db, deps.baseUrl);
    case "search-console":
      return importSearchConsole(deps.db);
  }
}

/**
 * Reads a Checkout Session from Stripe (server-to-server — the source of truth) and applies it
 * through the same idempotent handlers the webhook uses. Returns true if state changed.
 */
export async function syncCheckoutSession(deps: Deps, sessionId: string): Promise<boolean> {
  const s = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
  const pi = typeof s.payment_intent === "object" ? s.payment_intent : null;
  if (s.status === "expired") {
    await onCheckoutExpired(deps, s.id);
    return true;
  }
  if (s.status === "complete" && pi && (pi.status === "succeeded" || pi.status === "requires_capture")) {
    const r = await onCheckoutPaid(deps, { checkoutSessionId: s.id, paymentIntentId: pi.id, amountMinor: pi.amount, currency: pi.currency, captured: pi.status === "succeeded", livemode: s.livemode });
    return r.action !== "noop";
  }
  return false;
}

/**
 * Payment reconciliation: catches webhooks that never arrived. For each checkout open longer than
 * 40 minutes, ask Stripe for the truth and apply it through the same idempotent handlers.
 * Also fills processing fees from balance transactions for reporting.
 */
async function reconcilePayments(deps: Deps) {
  if (!process.env.STRIPE_SECRET_KEY) return { skipped: "no stripe key" };
  const stale = await deps.db.select().from(payments).where(and(eq(payments.status, "open"), lt(payments.createdAt, new Date(Date.now() - 40 * 60_000)))).limit(50);
  let fixed = 0;
  for (const p of stale) {
    if (p.checkoutSessionId && (await syncCheckoutSession(deps, p.checkoutSessionId))) fixed++;
  }
  const noFee = await deps.db.select().from(payments).where(and(eq(payments.status, "succeeded"), isNull(payments.feeMinor))).limit(50);
  for (const p of noFee) {
    if (!p.paymentIntentId) continue;
    const pi = await stripe().paymentIntents.retrieve(p.paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
    const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    const bt = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
    if (bt) await deps.db.update(payments).set({ feeMinor: bt.fee }).where(eq(payments.id, p.id));
  }
  return { checked: stale.length, fixed, fees: noFee.length };
}

/** Publishes scheduled articles that are medically approved; queues overdue medical reviews. */
async function contentMaintenance(database: Db, now: Date) {
  const due = await database
    .update(articles)
    .set({ status: "published", publishedAt: now, updatedAt: now })
    .where(and(eq(articles.status, "scheduled"), lte(articles.scheduledFor, now), sql`${articles.approvedRevision} = ${articles.revision}`))
    .returning({ id: articles.id });
  const stale = await database.select().from(articles).where(and(eq(articles.status, "published"), lte(articles.reviewDueAt, now)));
  for (const a of stale) {
    const [open] = await database.select().from(editorialTasks).where(and(eq(editorialTasks.articleId, a.id), eq(editorialTasks.type, "medical_review_due"), eq(editorialTasks.status, "open")));
    if (!open) await database.insert(editorialTasks).values({ articleId: a.id, type: "medical_review_due", title: `Medical review due: ${a.title}`, dueAt: a.reviewDueAt });
  }
  return { published: due.length, reviewTasks: stale.length };
}

async function dailySummary(deps: Deps, now: Date) {
  const date = formatInTimeZone(now, "Asia/Dubai", "yyyy-MM-dd");
  const start = new Date(`${date}T00:00:00+04:00`);
  const end = new Date(start.getTime() + 86400_000);
  const [{ n }] = await deps.db.select({ n: sql<number>`count(*)::int` }).from(bookings).where(and(gte(bookings.startsAt, start), lt(bookings.startsAt, end), inArray(bookings.status, ["confirmed", "awaiting_confirmation", "requested"])));
  const [{ p }] = await deps.db.select({ p: sql<number>`count(*)::int` }).from(bookings).where(inArray(bookings.status, ["awaiting_confirmation", "requested"]));
  const to = (process.env.STAFF_NOTIFY_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const addr of to) {
    await enqueue(deps.db, { dedupeKey: `daily:${date}:${addr}`, channel: "email", template: "staff_daily_summary", recipientAddress: addr, params: { date, count: String(n), pending: String(p), link: `${deps.baseUrl}/admin` } });
  }
  return { date, appointments: n, pending: p };
}
