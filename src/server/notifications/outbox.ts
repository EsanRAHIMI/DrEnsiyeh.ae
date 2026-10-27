import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { notifications } from "@/db/schema";
import { render, validateParams, type TemplateId } from "./templates";
import type { ChannelAdapters } from "./channels";
import { formatInTimeZone } from "date-fns-tz";
import { PRACTICE_TZ } from "@/lib/time";

export type Channel = "email" | "whatsapp" | "sms" | "in_app";

export type EnqueueInput = {
  dedupeKey: string;
  channel: Channel;
  template: TemplateId;
  recipientUserId?: string | null;
  recipientAddress?: string | null;
  params: Record<string, string>;
  notBefore?: Date;
};

/** Idempotent: the same dedupeKey is only ever queued once. */
export async function enqueue(database: Db | Tx, input: EnqueueInput) {
  validateParams(input.template, input.params);
  if (input.channel !== "in_app" && !input.recipientAddress) return;
  await database
    .insert(notifications)
    .values({
      dedupeKey: input.dedupeKey,
      channel: input.channel,
      template: input.template,
      recipientUserId: input.recipientUserId ?? null,
      recipientAddress: input.recipientAddress ?? null,
      params: input.params,
      notBefore: input.notBefore ?? new Date(),
      status: input.channel === "in_app" ? "delivered" : "queued",
    })
    .onConflictDoNothing({ target: notifications.dedupeKey });
}

/** Non-urgent messages are deferred out of quiet hours (22:00–08:00 Dubai). */
export function applyQuietHours(at: Date, urgent: boolean): Date {
  if (urgent) return at;
  const hour = Number(formatInTimeZone(at, PRACTICE_TZ, "H"));
  if (hour >= 8 && hour < 22) return at;
  const date = formatInTimeZone(hour >= 22 ? new Date(at.getTime() + 12 * 3600_000) : at, PRACTICE_TZ, "yyyy-MM-dd");
  return new Date(`${date}T08:00:00+04:00`);
}

const MAX_ATTEMPTS = 6;

/**
 * Delivers due notifications. Safe to run concurrently: rows are claimed with
 * FOR UPDATE SKIP LOCKED and moved to "sending" before any network call.
 */
export async function processOutbox(database: Db, adapters: ChannelAdapters, now = new Date(), batch = 25) {
  const claimed = await database.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(notifications)
      .where(and(eq(notifications.status, "queued"), lte(notifications.notBefore, now)))
      .limit(batch)
      .for("update", { skipLocked: true });
    if (rows.length) {
      await tx
        .update(notifications)
        .set({ status: "sending", attempts: sql`${notifications.attempts} + 1`, updatedAt: now })
        .where(inArray(notifications.id, rows.map((r) => r.id)));
    }
    return rows;
  });

  const results = { sent: 0, failed: 0, retried: 0 };
  for (const n of claimed) {
    const msg = render(n.template as TemplateId, n.params as Record<string, string>);
    try {
      const adapter = adapters[n.channel as Exclude<Channel, "in_app">];
      if (!adapter) throw new Error(`No adapter for ${n.channel}`);
      const providerMessageId = await adapter.send({
        to: n.recipientAddress!,
        subject: msg.subject,
        text: msg.text,
        whatsappTemplate: msg.whatsappTemplate,
        params: n.params as Record<string, string>,
      });
      await database
        .update(notifications)
        .set({ status: "sent", providerMessageId, lastError: null, updatedAt: new Date() })
        .where(eq(notifications.id, n.id));
      results.sent++;
    } catch (err) {
      const attempts = n.attempts + 1;
      const final = attempts >= MAX_ATTEMPTS;
      const backoffMin = Math.min(2 ** attempts, 120);
      await database
        .update(notifications)
        .set({
          status: final ? "failed" : "queued",
          lastError: err instanceof Error ? err.message.slice(0, 500) : "unknown error",
          notBefore: new Date(now.getTime() + backoffMin * 60_000),
          updatedAt: new Date(),
        })
        .where(eq(notifications.id, n.id));
      if (final) {
        results.failed++;
        // Escalate failed patient-facing delivery to staff by email (never recursive on ops_alert).
        if (n.template !== "ops_alert" && process.env.OPS_ALERT_EMAIL) {
          await enqueue(database, {
            dedupeKey: `ops:notification_failed:${n.id}`,
            channel: "email",
            template: "ops_alert",
            recipientAddress: process.env.OPS_ALERT_EMAIL,
            params: { kind: "Notification delivery failed", detail: `${n.channel}/${n.template} id=${n.id}` },
          });
        }
      } else results.retried++;
    }
  }
  return results;
}
