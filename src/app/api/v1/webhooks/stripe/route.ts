import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { processedWebhooks } from "@/db/schema";
import { stripe } from "@/server/payments/gateway";
import { bookingDeps } from "@/server/deps";
import { onChargeRefunded, onCheckoutExpired, onCheckoutPaid, onPaymentFailed } from "@/server/booking/engine";
import { enqueue } from "@/server/notifications/outbox";

/**
 * Stripe webhook — the ONLY path by which a booking becomes paid.
 * - Signature verified against the raw body.
 * - Each event id processed once (processed_webhooks).
 * - Livemode events are rejected unless live payments are authorised.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  if (!secret || !sig) return NextResponse.json({ error: "not_configured" }, { status: 400 });
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const database = db();
  const [already] = await database.select().from(processedWebhooks).where(eq(processedWebhooks.eventId, event.id));
  if (already) return NextResponse.json({ received: true, duplicate: true });

  const deps = await bookingDeps();
  if (event.livemode && deps.compliance.paymentsMode !== "live") {
    await enqueue(database, { dedupeKey: `ops:livemode:${event.id}`, channel: "email", template: "ops_alert", recipientAddress: process.env.OPS_ALERT_EMAIL ?? null, params: { kind: "Unexpected live Stripe event", detail: event.id } });
    return NextResponse.json({ error: "live_not_authorised" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.payment_status === "unpaid" && event.type === "checkout.session.completed") {
          // Manual-capture sessions report "unpaid" but the PaymentIntent is authorised.
          const pi = await stripe().paymentIntents.retrieve(s.payment_intent as string);
          if (pi.status !== "requires_capture") break;
          await onCheckoutPaid(deps, { checkoutSessionId: s.id, paymentIntentId: pi.id, amountMinor: pi.amount, currency: pi.currency, captured: false, livemode: event.livemode });
        } else {
          const piId = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
          await onCheckoutPaid(deps, { checkoutSessionId: s.id, paymentIntentId: piId!, amountMinor: s.amount_total ?? 0, currency: s.currency ?? "aed", captured: true, livemode: event.livemode });
        }
        break;
      }
      case "checkout.session.expired":
        await onCheckoutExpired(deps, (event.data.object as Stripe.Checkout.Session).id);
        break;
      case "payment_intent.payment_failed":
        await onPaymentFailed(deps, (event.data.object as Stripe.PaymentIntent).id);
        break;
      case "charge.refunded": {
        const ch = event.data.object as Stripe.Charge;
        if (typeof ch.payment_intent === "string") await onChargeRefunded(deps, ch.payment_intent, ch.amount_refunded);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] processing failed", event.type, event.id, err instanceof Error ? err.message : "");
    // Non-2xx → Stripe retries with backoff. Ops is alerted after repeated failures by the reconciliation job.
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  await database.insert(processedWebhooks).values({ eventId: event.id, source: "stripe", type: event.type }).onConflictDoNothing();
  return NextResponse.json({ received: true });
}
