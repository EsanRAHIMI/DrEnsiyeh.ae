import type { Db } from "@/db";
import { availabilityRules, facilities, homeVisitZones, offerings, providers, services, users } from "@/db/schema";
import type { PaymentGateway, CheckoutRequest } from "@/server/payments/gateway";
import { DEFAULT_COMPLIANCE, type Compliance } from "@/server/compliance";
import type { Deps } from "@/server/booking/engine";

export async function seedPractice(db: Db, opts: { facilityPaymentMode?: "prepay" | "pay_at_facility"; confirmationMode?: "auto_on_payment" | "manual_staff"; captureMode?: "automatic" | "on_confirmation" } = {}) {
  const [provider] = await db.insert(providers).values({ slug: "dr-test", fullName: "Dr. Test" }).returning();
  const [facility] = await db
    .insert(facilities)
    .values({
      slug: "test-clinic",
      name: "Test Clinic",
      status: "verified",
      paymentMode: opts.facilityPaymentMode ?? "prepay",
      confirmationMode: opts.confirmationMode ?? "manual_staff",
      captureMode: opts.captureMode ?? "on_confirmation",
      cancellationPolicy: { freeCancelHours: 24, lateCancelRefundPercent: 50 },
    })
    .returning();
  const [clinicSvc] = await db
    .insert(services)
    .values({ slug: "consult", kind: "clinic", name: { en: "Consultation" }, summary: { en: "" }, durationMinutes: 30 })
    .returning();
  const [homeSvc] = await db
    .insert(services)
    .values({ slug: "home", kind: "home_visit", name: { en: "Home visit" }, summary: { en: "" }, durationMinutes: 45 })
    .returning();
  const [clinicOffering] = await db
    .insert(offerings)
    .values({ serviceId: clinicSvc.id, facilityId: facility.id, providerId: provider.id, priceMinor: 50000, minNoticeMinutes: 60, bufferAfterMinutes: 0 })
    .returning();
  const [homeOffering] = await db
    .insert(offerings)
    .values({ serviceId: homeSvc.id, facilityId: null, providerId: provider.id, priceMinor: 90000, minNoticeMinutes: 60 })
    .returning();
  // Every day 09:00–13:00 at the clinic, 15:00–19:00 home visits (Dubai time)
  for (let wd = 0; wd < 7; wd++) {
    await db.insert(availabilityRules).values({ providerId: provider.id, facilityId: facility.id, kind: "clinic", weekday: wd, startTime: "09:00", endTime: "13:00", slotStepMinutes: 30 });
    await db.insert(availabilityRules).values({ providerId: provider.id, facilityId: null, kind: "home_visit", weekday: wd, startTime: "15:00", endTime: "19:00", slotStepMinutes: 30 });
  }
  // Zone: 15 km around Dubai Marina
  const [zone] = await db.insert(homeVisitZones).values({ name: "Marina", centerLat: 25.0805, centerLng: 55.1403, radiusKm: 15, surchargeMinor: 15000, travelBufferMinutes: 30 }).returning();
  const [staff] = await db.insert(users).values({ email: "doctor@example.test", roles: ["doctor"] }).returning();
  return { provider, facility, clinicOffering, homeOffering, zone, staff };
}

export class FakeGateway implements PaymentGateway {
  checkouts: CheckoutRequest[] = [];
  captured: string[] = [];
  cancelled: string[] = [];
  refunds: { pi: string; amount: number; key: string }[] = [];
  async createCheckout(req: CheckoutRequest) {
    this.checkouts.push(req);
    return { sessionId: `cs_test_${this.checkouts.length}_${req.bookingId.slice(0, 8)}`, url: `https://checkout.stripe.test/${req.bookingId}`, livemode: false };
  }
  async capture(pi: string) {
    this.captured.push(pi);
  }
  async cancelAuthorization(pi: string) {
    this.cancelled.push(pi);
  }
  async refund(pi: string, amount: number, key: string) {
    this.refunds.push({ pi, amount, key });
    return { refundId: `re_${this.refunds.length}`, status: "succeeded" };
  }
  async expireCheckout() {}
}

export function makeDeps(db: Db, now: Date, compliance: Partial<Compliance> = {}, gateway = new FakeGateway()): Deps & { gateway: FakeGateway } {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  return {
    db,
    gateway,
    compliance: { ...DEFAULT_COMPLIANCE, paymentsMode: "test", ...compliance },
    baseUrl: "https://staging.drensiyeh.ae",
    now: () => now,
  };
}
