import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers/db";
import { makeDeps, seedPractice } from "./helpers/fixtures";
import {
  availableSlots,
  BookingError,
  cancelBooking,
  confirmBooking,
  createHold,
  onCheckoutPaid,
  refundAmountFor,
  rescheduleBooking,
  submitDetailsAndCheckout,
  expireStaleHolds,
} from "@/server/booking/engine";
import { bookings, invoices, notifications, patients, payments, users } from "@/db/schema";
import type { Db } from "@/db";
import { localToUtc } from "@/lib/time";

// Fixed "now": Sunday 1 Nov 2026 06:00 Dubai.
const NOW = localToUtc("2026-11-01", "06:00");
const DAY = "2026-11-02";
const at = (t: string, d = DAY) => localToUtc(d, t);

const details = { fullName: "Amina Test", email: "Amina@Example.test", phone: "+971500000001", acceptedPolicyVersion: "2026-10" };

let db: Db;
let fx: Awaited<ReturnType<typeof seedPractice>>;

beforeEach(async () => {
  ({ db } = await createTestDb());
  fx = await seedPractice(db);
});

describe("slot availability", () => {
  it("offers slots inside working hours in Dubai time", async () => {
    const slots = await availableSlots(db, { offeringId: fx.clinicOffering.id, fromDate: DAY, days: 1, now: NOW });
    expect(slots[0].start.toISOString()).toBe(at("09:00").toISOString());
    expect(slots.at(-1)!.end.toISOString()).toBe(at("13:00").toISOString());
    expect(slots).toHaveLength(8);
  });

  it("respects minimum notice", async () => {
    const slots = await availableSlots(db, { offeringId: fx.clinicOffering.id, fromDate: DAY, days: 1, now: at("09:20") });
    expect(slots[0].start.toISOString()).toBe(at("10:30").toISOString());
  });

  it("removes slots that overlap an active hold", async () => {
    const deps = makeDeps(db, NOW);
    await createHold(deps, { offeringId: fx.clinicOffering.id, startsAt: at("10:00"), idempotencyKey: "k1" });
    const slots = await availableSlots(db, { offeringId: fx.clinicOffering.id, fromDate: DAY, days: 1, now: NOW });
    expect(slots.map((s) => s.start.toISOString())).not.toContain(at("10:00").toISOString());
  });
});

describe("double-booking prevention", () => {
  it("rejects a second hold on the same slot", async () => {
    const deps = makeDeps(db, NOW);
    await createHold(deps, { offeringId: fx.clinicOffering.id, startsAt: at("10:00"), idempotencyKey: "a" });
    await expect(createHold(deps, { offeringId: fx.clinicOffering.id, startsAt: at("10:00"), idempotencyKey: "b" })).rejects.toMatchObject({ code: "slot_unavailable" });
  });

  it("allows only one of many concurrent holds to win", async () => {
    const deps = makeDeps(db, NOW);
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => createHold(deps, { offeringId: fx.clinicOffering.id, startsAt: at("11:00"), idempotencyKey: `c${i}` })),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    const active = await db.select().from(bookings).where(eq(bookings.status, "hold"));
    expect(active).toHaveLength(1);
  });

  it("database constraint blocks overlaps even if application checks are bypassed", async () => {
    const deps = makeDeps(db, NOW);
    const { booking } = await createHold(deps, { offeringId: fx.clinicOffering.id, startsAt: at("10:00"), idempotencyKey: "x" });
    const { id: _id, reference: _r, idempotencyKey: _k, ...rest } = booking;
    await expect(db.insert(bookings).values({ ...rest, reference: "DR-ZZZZZZ", idempotencyKey: "raw" })).rejects.toThrow();
  });

  it("is idempotent for the same idempotency key", async () => {
    const deps = makeDeps(db, NOW);
    const a = await createHold(deps, { offeringId: fx.clinicOffering.id, startsAt: at("10:00"), idempotencyKey: "same" });
    const b = await createHold(deps, { offeringId: fx.clinicOffering.id, startsAt: at("10:00"), idempotencyKey: "same" });
    expect(a.booking.id).toBe(b.booking.id);
  });

  it("frees lapsed holds", async () => {
    const deps = makeDeps(db, NOW);
    await createHold(deps, { offeringId: fx.clinicOffering.id, startsAt: at("10:00"), idempotencyKey: "h1" });
    const later = makeDeps(db, new Date(NOW.getTime() + 11 * 60_000));
    const { booking } = await createHold(later, { offeringId: fx.clinicOffering.id, startsAt: at("10:00"), idempotencyKey: "h2" });
    expect(booking.status).toBe("hold");
    expect(await expireStaleHolds(db, new Date(NOW.getTime() + 11 * 60_000))).toBe(0);
  });
});

describe("payment lifecycle", () => {
  async function paidBooking(deps: ReturnType<typeof makeDeps>, time = "10:00") {
    const { booking, accessToken } = await createHold(deps, { offeringId: fx.clinicOffering.id, startsAt: at(time), idempotencyKey: `p-${time}` });
    const out = await submitDetailsAndCheckout(deps, booking.id, accessToken, details);
    expect(out.type).toBe("redirect");
    const [pay] = await db.select().from(payments).where(eq(payments.bookingId, booking.id));
    return { booking, pay };
  }

  it("does not confirm until the webhook verifies payment; then awaits facility confirmation", async () => {
    const deps = makeDeps(db, NOW);
    const { booking, pay } = await paidBooking(deps);
    expect((await db.select().from(bookings).where(eq(bookings.id, booking.id)))[0].status).toBe("pending_payment");
    // Neutral description — never the medical service on the card statement.
    expect(deps.gateway.checkouts[0].description).toBe("Medical consultation");
    expect(deps.gateway.checkouts[0].captureMethod).toBe("manual");

    await onCheckoutPaid(deps, { checkoutSessionId: pay.checkoutSessionId!, paymentIntentId: "pi_1", amountMinor: 50000, currency: "aed", captured: false, livemode: false });
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b.status).toBe("awaiting_confirmation");

    // Replay is a no-op
    const replay = await onCheckoutPaid(deps, { checkoutSessionId: pay.checkoutSessionId!, paymentIntentId: "pi_1", amountMinor: 50000, currency: "aed", captured: false, livemode: false });
    expect(replay.action).toBe("noop");

    const confirmed = await confirmBooking(deps, { userId: fx.staff.id, role: "doctor", type: "staff" }, booking.id);
    expect(confirmed.status).toBe("confirmed");
    expect(deps.gateway.captured).toEqual(["pi_1"]);
    expect(await db.select().from(invoices)).toHaveLength(1);
  });

  it("rejects amount mismatches", async () => {
    const deps = makeDeps(db, NOW);
    const { pay } = await paidBooking(deps);
    await expect(
      onCheckoutPaid(deps, { checkoutSessionId: pay.checkoutSessionId!, paymentIntentId: "pi_x", amountMinor: 100, currency: "aed", captured: true, livemode: false }),
    ).rejects.toThrow(/mismatch/);
  });

  it("creates exactly one account and patient, unverified, without passwords", async () => {
    const deps = makeDeps(db, NOW);
    const { pay } = await paidBooking(deps);
    await onCheckoutPaid(deps, { checkoutSessionId: pay.checkoutSessionId!, paymentIntentId: "pi_1", amountMinor: 50000, currency: "aed", captured: false, livemode: false });
    const { pay: pay2 } = await paidBooking(deps, "11:00");
    await onCheckoutPaid(deps, { checkoutSessionId: pay2.checkoutSessionId!, paymentIntentId: "pi_2", amountMinor: 50000, currency: "aed", captured: false, livemode: false });
    const u = await db.select().from(users).where(eq(users.email, "amina@example.test"));
    expect(u).toHaveLength(1);
    expect(u[0].emailVerifiedAt).toBeNull();
    const p = await db.select().from(patients).where(eq(patients.accountUserId, u[0].id));
    expect(p).toHaveLength(1);
    expect(p[0].identityVerifiedAt).toBeNull();
  });

  it("refunds automatically if the slot was lost while paying", async () => {
    const deps = makeDeps(db, NOW);
    const { booking, pay } = await paidBooking(deps);
    // Checkout lapses, someone else takes the slot.
    const later = makeDeps(db, new Date(NOW.getTime() + 40 * 60_000), {}, deps.gateway);
    await createHold(later, { offeringId: fx.clinicOffering.id, startsAt: at("10:00"), idempotencyKey: "thief" });
    const res = await onCheckoutPaid(later, { checkoutSessionId: pay.checkoutSessionId!, paymentIntentId: "pi_late", amountMinor: 50000, currency: "aed", captured: false, livemode: false });
    expect(res.action).toBe("release_payment");
    expect(deps.gateway.cancelled).toContain("pi_late");
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b.status).toBe("expired");
  });

  it("falls back to a booking request when payments are disabled", async () => {
    const deps = makeDeps(db, NOW, { paymentsMode: "disabled" });
    const { booking, accessToken } = await createHold(deps, { offeringId: fx.clinicOffering.id, startsAt: at("10:00"), idempotencyKey: "req" });
    const out = await submitDetailsAndCheckout(deps, booking.id, accessToken, details);
    expect(out.type).toBe("requested");
    expect(out.booking.status).toBe("requested");
    expect(deps.gateway.checkouts).toHaveLength(0);
  });

  it("rejects a forged guest token", async () => {
    const deps = makeDeps(db, NOW);
    const { booking } = await createHold(deps, { offeringId: fx.clinicOffering.id, startsAt: at("10:00"), idempotencyKey: "forge" });
    await expect(submitDetailsAndCheckout(deps, booking.id, "forged", details)).rejects.toBeInstanceOf(BookingError);
  });
});

describe("cancellation & rescheduling", () => {
  it("computes refunds from the facility policy", () => {
    const b = { startsAt: at("10:00"), totalMinor: 50000 };
    expect(refundAmountFor(b, { freeCancelHours: 24, lateCancelRefundPercent: 50 }, localToUtc("2026-11-01", "09:00"), "patient")).toBe(50000);
    expect(refundAmountFor(b, { freeCancelHours: 24, lateCancelRefundPercent: 50 }, localToUtc("2026-11-02", "08:00"), "patient")).toBe(25000);
    expect(refundAmountFor(b, { freeCancelHours: 24, lateCancelRefundPercent: 0 }, localToUtc("2026-11-02", "08:00"), "staff")).toBe(50000);
  });

  it("cancels an authorised-but-uncaptured payment instead of refunding", async () => {
    const deps = makeDeps(db, NOW);
    const { booking, accessToken } = await createHold(deps, { offeringId: fx.clinicOffering.id, startsAt: at("10:00"), idempotencyKey: "cx" });
    await submitDetailsAndCheckout(deps, booking.id, accessToken, details);
    const [pay] = await db.select().from(payments).where(eq(payments.bookingId, booking.id));
    await onCheckoutPaid(deps, { checkoutSessionId: pay.checkoutSessionId!, paymentIntentId: "pi_c", amountMinor: 50000, currency: "aed", captured: false, livemode: false });
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    await cancelBooking(deps, { userId: b.accountUserId, role: "patient", type: "patient" }, b.id, "changed plans");
    expect(deps.gateway.cancelled).toContain("pi_c");
    expect(deps.gateway.refunds).toHaveLength(0);
  });

  it("prevents a patient cancelling someone else's booking", async () => {
    const deps = makeDeps(db, NOW, { paymentsMode: "disabled" });
    const { booking, accessToken } = await createHold(deps, { offeringId: fx.clinicOffering.id, startsAt: at("10:00"), idempotencyKey: "own" });
    await submitDetailsAndCheckout(deps, booking.id, accessToken, details);
    await expect(cancelBooking(deps, { userId: fx.staff.id, role: "patient", type: "patient" }, booking.id, "x")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("reschedules atomically and frees the old slot", async () => {
    const deps = makeDeps(db, NOW, { paymentsMode: "disabled" });
    const { booking, accessToken } = await createHold(deps, { offeringId: fx.clinicOffering.id, startsAt: at("10:00"), idempotencyKey: "rs" });
    await submitDetailsAndCheckout(deps, booking.id, accessToken, details);
    const moved = await rescheduleBooking(deps, { userId: fx.staff.id, role: "reception", type: "staff" }, booking.id, at("12:00"));
    expect(moved.startsAt.toISOString()).toBe(at("12:00").toISOString());
    const slots = await availableSlots(db, { offeringId: fx.clinicOffering.id, fromDate: DAY, days: 1, now: NOW });
    expect(slots.map((s) => s.start.toISOString())).toContain(at("10:00").toISOString());
  });
});

describe("home visits", () => {
  it("are blocked until home-healthcare authorisation is recorded", async () => {
    const deps = makeDeps(db, NOW);
    await expect(
      createHold(deps, { offeringId: fx.homeOffering.id, startsAt: at("15:00"), idempotencyKey: "hv0", home: { lat: 25.08, lng: 55.14, address: "Marina" } }),
    ).rejects.toMatchObject({ code: "home_visits_disabled" });
  });

  it("apply eligibility, surcharge and travel buffers when authorised", async () => {
    const deps = makeDeps(db, NOW, { homeVisitsMode: "enabled", homeHealthcareAuthorizationRef: "TEST-AUTH" });
    await expect(
      createHold(deps, { offeringId: fx.homeOffering.id, startsAt: at("15:30"), idempotencyKey: "far", home: { lat: 25.2, lng: 55.6, address: "Far away" } }),
    ).rejects.toMatchObject({ code: "outside_service_area" });

    const { booking } = await createHold(deps, { offeringId: fx.homeOffering.id, startsAt: at("15:30"), idempotencyKey: "hv1", home: { lat: 25.09, lng: 55.15, address: "Marina Walk" } });
    expect(booking.totalMinor).toBe(90000 + 15000);
    expect(booking.blockStartsAt.toISOString()).toBe(at("15:00").toISOString());
    expect(booking.homeAddressEnc).not.toContain("Marina");
    // Travel buffer means a 15:30 visit blocks 15:00–16:45, so the next 30-min-step start is 17:30
    const slots = await availableSlots(db, { offeringId: fx.homeOffering.id, fromDate: DAY, days: 1, travelBufferMinutes: 30, now: NOW });
    const starts = slots.map((s) => s.start.toISOString());
    expect(starts).not.toContain(at("16:30").toISOString());
    expect(starts).toContain(at("17:30").toISOString());
  });
});

describe("notification privacy", () => {
  it("never puts clinical or service details in queued messages", async () => {
    const deps = makeDeps(db, NOW, { paymentsMode: "disabled", whatsappMode: "sandbox" });
    const { booking, accessToken } = await createHold(deps, { offeringId: fx.clinicOffering.id, startsAt: at("10:00"), idempotencyKey: "np" });
    await submitDetailsAndCheckout(deps, booking.id, accessToken, details);
    const rows = await db.select().from(notifications);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const json = JSON.stringify(r.params);
      expect(json).not.toMatch(/consult|infection|diagnos/i);
      expect(Object.keys(r.params as object).every((k) => ["reference", "when", "location", "link", "status"].includes(k))).toBe(true);
    }
  });
});
