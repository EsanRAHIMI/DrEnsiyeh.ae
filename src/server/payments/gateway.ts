import Stripe from "stripe";

export type CheckoutRequest = {
  bookingId: string;
  reference: string;
  amountMinor: number;
  currency: string;
  /** Neutral line-item label — never the medical service name (it appears on card statements/receipts). */
  description: string;
  customerEmail?: string | null;
  captureMethod: "automatic" | "manual";
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
  idempotencyKey: string;
};

export type CheckoutResult = { sessionId: string; url: string; livemode: boolean };

export interface PaymentGateway {
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  capture(paymentIntentId: string, idempotencyKey: string): Promise<void>;
  cancelAuthorization(paymentIntentId: string, idempotencyKey: string): Promise<void>;
  refund(paymentIntentId: string, amountMinor: number, idempotencyKey: string): Promise<{ refundId: string; status: string }>;
  expireCheckout(sessionId: string): Promise<void>;
}

let stripeClient: Stripe | null = null;

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (process.env.NODE_ENV !== "production" && key.startsWith("sk_live_")) {
    throw new Error("Refusing to use a live Stripe key outside production");
  }
  stripeClient ??= new Stripe(key, { appInfo: { name: "drensiyeh-platform" } });
  return stripeClient;
}

export const stripeGateway = (): PaymentGateway => ({
  async createCheckout(req) {
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: req.bookingId,
        customer_email: req.customerEmail ?? undefined,
        // Card covers Visa/Mastercard; Apple Pay & Google Pay are surfaced automatically by Checkout for card.
        payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: req.currency.toLowerCase(),
              unit_amount: req.amountMinor,
              product_data: { name: req.description },
            },
          },
        ],
        payment_intent_data: {
          capture_method: req.captureMethod,
          description: `Booking ${req.reference}`,
          metadata: { bookingId: req.bookingId, reference: req.reference },
        },
        metadata: { bookingId: req.bookingId, reference: req.reference },
        expires_at: Math.floor(req.expiresAt.getTime() / 1000),
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
        invoice_creation: undefined,
      },
      { idempotencyKey: req.idempotencyKey },
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { sessionId: session.id, url: session.url, livemode: session.livemode };
  },
  async capture(paymentIntentId, idempotencyKey) {
    await stripe().paymentIntents.capture(paymentIntentId, {}, { idempotencyKey });
  },
  async cancelAuthorization(paymentIntentId, idempotencyKey) {
    await stripe().paymentIntents.cancel(paymentIntentId, {}, { idempotencyKey });
  },
  async refund(paymentIntentId, amountMinor, idempotencyKey) {
    const r = await stripe().refunds.create({ payment_intent: paymentIntentId, amount: amountMinor }, { idempotencyKey });
    return { refundId: r.id, status: r.status ?? "pending" };
  },
  async expireCheckout(sessionId) {
    try {
      await stripe().checkout.sessions.expire(sessionId);
    } catch {
      // already completed/expired — fine
    }
  },
});
