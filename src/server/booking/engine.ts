import { and, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { createHmac, randomInt } from "node:crypto";
import type { Db, Tx } from "@/db";
import {
  availabilityExceptions,
  availabilityRules,
  bookingEvents,
  bookings,
  calendarConnections,
  calendarEventLinks,
  externalBusy,
  facilities,
  homeVisitZones,
  invoices,
  offerings,
  payments,
  refunds,
  services,
} from "@/db/schema";
import { encrypt, safeEqual } from "@/lib/crypto";
import { haversineKm } from "@/lib/geo";
import { formatMoney } from "@/lib/money";
import { addMinutes, formatLocal, PRACTICE_TZ, utcToLocalDate } from "@/lib/time";
import { audit, type Actor, SYSTEM } from "@/server/audit";
import { type Compliance, paymentsEnabled, requireCapability } from "@/server/compliance";
import { enqueue, applyQuietHours } from "@/server/notifications/outbox";
import type { PaymentGateway } from "@/server/payments/gateway";
import { computeSlots, type Interval, type Slot } from "./slots";
import { linkBookingToAccount } from "@/server/accounts";

export type BookingStatus = (typeof bookings.$inferSelect)["status"];
export type Booking = typeof bookings.$inferSelect;

export const ACTIVE_STATUSES: BookingStatus[] = ["hold", "pending_payment", "requested", "awaiting_confirmation", "confirmed"];

/** Allowed state machine transitions. Anything else is rejected. */
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  hold: ["pending_payment", "requested", "expired", "cancelled"],
  pending_payment: ["awaiting_confirmation", "confirmed", "expired", "cancelled", "hold"],
  requested: ["confirmed", "cancelled"],
  awaiting_confirmation: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  // A late payment for an expired hold can revive the booking if the slot is still free.
  expired: ["awaiting_confirmation", "confirmed"],
  no_show: [],
};

export const HOLD_MINUTES = 10;
export const CHECKOUT_MINUTES = 30;

export class BookingError extends Error {
  constructor(
    public code:
      | "slot_unavailable"
      | "invalid_slot"
      | "not_found"
      | "invalid_transition"
      | "concurrent_update"
      | "hold_expired"
      | "outside_service_area"
      | "home_visits_disabled"
      | "forbidden"
      | "invalid_input",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type Deps = {
  db: Db;
  gateway: PaymentGateway;
  compliance: Compliance;
  baseUrl: string;
  now?: () => Date;
};

const nowOf = (d: Pick<Deps, "now">) => (d.now ? d.now() : new Date());

// ─── References & guest access tokens ──────────────────────────────────────────

const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function newReference(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += REF_ALPHABET[randomInt(0, REF_ALPHABET.length)];
  return `DR-${s}`;
}

/** Stateless capability token letting the guest who created a hold continue the flow. */
export function bookingAccessToken(bookingId: string): string {
  const secret = process.env.BOOKING_TOKEN_SECRET ?? process.env.TOKEN_PEPPER ?? "dev-only-secret";
  return createHmac("sha256", secret).update(`booking:${bookingId}`).digest("base64url");
}

export function verifyBookingAccessToken(bookingId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  return safeEqual(bookingAccessToken(bookingId), token);
}

// ─── Availability ─────────────────────────────────────────────────────────────

export type OfferingContext = Awaited<ReturnType<typeof loadOffering>>;

export async function loadOffering(database: Db | Tx, offeringId: string) {
  const [row] = await database
    .select({ offering: offerings, service: services, facility: facilities })
    .from(offerings)
    .innerJoin(services, eq(services.id, offerings.serviceId))
    .leftJoin(facilities, eq(facilities.id, offerings.facilityId))
    .where(eq(offerings.id, offeringId));
  if (!row || !row.offering.active || !row.service.active) throw new BookingError("not_found", "Offering not available");
  return row;
}

export type HomeEligibility =
  | { eligible: true; zoneId: string; zoneName: string; surchargeMinor: number; travelBufferMinutes: number; distanceKm: number }
  | { eligible: false; reason: "outside_service_area" };

export async function checkHomeEligibility(database: Db | Tx, lat: number, lng: number): Promise<HomeEligibility> {
  const zones = await database.select().from(homeVisitZones).where(eq(homeVisitZones.active, true));
  let best: HomeEligibility | null = null;
  for (const z of zones) {
    const d = haversineKm(lat, lng, z.centerLat, z.centerLng);
    if (d <= z.radiusKm && (!best || (best.eligible && d < best.distanceKm))) {
      best = {
        eligible: true,
        zoneId: z.id,
        zoneName: z.name,
        surchargeMinor: z.surchargeMinor,
        travelBufferMinutes: z.travelBufferMinutes,
        distanceKm: Math.round(d * 10) / 10,
      };
    }
  }
  return best ?? { eligible: false, reason: "outside_service_area" };
}

function bufferFor(ctx: OfferingContext, travelBufferMinutes = 0) {
  return {
    before: ctx.offering.bufferBeforeMinutes + travelBufferMinutes,
    after: ctx.offering.bufferAfterMinutes + travelBufferMinutes,
  };
}

async function busyIntervals(database: Db | Tx, providerId: string, from: Date, to: Date, now: Date, excludeBookingId?: string) {
  const active = await database
    .select({ id: bookings.id, start: bookings.blockStartsAt, end: bookings.blockEndsAt, status: bookings.status, holdExpiresAt: bookings.holdExpiresAt })
    .from(bookings)
    .where(
      and(
        eq(bookings.providerId, providerId),
        inArray(bookings.status, ACTIVE_STATUSES),
        lt(bookings.blockStartsAt, to),
        gte(bookings.blockEndsAt, from),
      ),
    );
  const ext = await database
    .select({ start: externalBusy.startsAt, end: externalBusy.endsAt })
    .from(externalBusy)
    .where(and(eq(externalBusy.providerId, providerId), lt(externalBusy.startsAt, to), gte(externalBusy.endsAt, from)));
  const blocks = await database
    .select({ start: availabilityExceptions.startsAt, end: availabilityExceptions.endsAt, type: availabilityExceptions.type })
    .from(availabilityExceptions)
    .where(and(eq(availabilityExceptions.providerId, providerId), lt(availabilityExceptions.startsAt, to), gte(availabilityExceptions.endsAt, from)));

  const busy: Interval[] = [
    ...active
      .filter((b) => b.id !== excludeBookingId)
      // Lapsed holds no longer block the calendar (they are swept to "expired" lazily).
      .filter((b) => !((b.status === "hold" || b.status === "pending_payment") && b.holdExpiresAt && b.holdExpiresAt < now))
      .map((b) => ({ start: b.start, end: b.end })),
    ...ext,
    ...blocks.filter((b) => b.type === "block").map((b) => ({ start: b.start, end: b.end })),
  ];
  const openings = blocks.filter((b) => b.type === "open").map((b) => ({ start: b.start, end: b.end }));
  return { busy, openings };
}

export async function availableSlots(
  database: Db | Tx,
  params: { offeringId: string; fromDate: string; days: number; travelBufferMinutes?: number; now: Date; excludeBookingId?: string },
): Promise<Slot[]> {
  const ctx = await loadOffering(database, params.offeringId);
  const kind = ctx.service.kind;
  const tz = ctx.facility?.timeZone ?? PRACTICE_TZ;
  const rules = await database
    .select()
    .from(availabilityRules)
    .where(
      and(
        eq(availabilityRules.providerId, ctx.offering.providerId),
        eq(availabilityRules.kind, kind),
        ctx.offering.facilityId ? eq(availabilityRules.facilityId, ctx.offering.facilityId) : sql`true`,
      ),
    );
  const from = new Date(`${params.fromDate}T00:00:00+04:00`);
  const to = addMinutes(from, (params.days + 1) * 24 * 60);
  const { busy, openings } = await busyIntervals(database, ctx.offering.providerId, addMinutes(from, -240), addMinutes(to, 240), params.now, params.excludeBookingId);
  const buf = bufferFor(ctx, params.travelBufferMinutes ?? 0);
  return computeSlots({
    rules,
    openings,
    busy,
    fromDate: params.fromDate,
    days: params.days,
    durationMinutes: ctx.offering.durationMinutes ?? ctx.service.durationMinutes,
    bufferBeforeMinutes: buf.before,
    bufferAfterMinutes: buf.after,
    minNoticeMinutes: ctx.offering.minNoticeMinutes,
    maxAdvanceDays: ctx.offering.maxAdvanceDays,
    now: params.now,
    timeZone: tz,
  });
}

// ─── Transitions ──────────────────────────────────────────────────────────────

async function transition(
  tx: Tx,
  booking: Booking,
  to: BookingStatus,
  actor: Actor,
  patch: Partial<typeof bookings.$inferInsert> = {},
  note?: string,
): Promise<Booking> {
  if (!TRANSITIONS[booking.status].includes(to)) {
    throw new BookingError("invalid_transition", `Cannot move booking from ${booking.status} to ${to}`);
  }
  // Optimistic concurrency: the row must still be in the state/version we read.
  const updated = await tx
    .update(bookings)
    .set({ ...patch, status: to, version: booking.version + 1, updatedAt: new Date() })
    .where(and(eq(bookings.id, booking.id), eq(bookings.status, booking.status), eq(bookings.version, booking.version)))
    .returning();
  if (updated.length !== 1) throw new BookingError("concurrent_update");
  await tx.insert(bookingEvents).values({
    bookingId: booking.id,
    fromStatus: booking.status,
    toStatus: to,
    actorUserId: actor.userId,
    actorType: actor.type,
    note: note ?? null,
  });
  return updated[0];
}

function isExclusionViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23P01" || e?.cause?.code === "23P01";
}

/** Marks lapsed holds/checkouts as expired so they stop occupying the exclusion constraint. */
export async function expireStaleHolds(database: Db | Tx, now: Date, providerId?: string) {
  const stale = await database
    .update(bookings)
    .set({ status: "expired", updatedAt: now, version: sql`${bookings.version} + 1` })
    .where(
      and(
        inArray(bookings.status, ["hold", "pending_payment"]),
        lt(bookings.holdExpiresAt, now),
        providerId ? eq(bookings.providerId, providerId) : sql`true`,
      ),
    )
    .returning({ id: bookings.id, status: bookings.status });
  if (stale.length) {
    await database.insert(bookingEvents).values(
      stale.map((s) => ({ bookingId: s.id, fromStatus: "hold", toStatus: "expired", actorType: "system" as const, note: "hold lapsed" })),
    );
  }
  return stale.length;
}

// ─── Hold creation ─────────────────────────────────────────────────────────────

export type CreateHoldInput = {
  offeringId: string;
  startsAt: Date;
  idempotencyKey: string;
  home?: { lat: number; lng: number; address: string; accessNotes?: string };
  attributionId?: string | null;
  accountUserId?: string | null;
};

export async function createHold(deps: Deps, input: CreateHoldInput): Promise<{ booking: Booking; accessToken: string }> {
  const now = nowOf(deps);
  return deps.db.transaction(async (tx) => {
    const [existing] = await tx.select().from(bookings).where(eq(bookings.idempotencyKey, input.idempotencyKey));
    if (existing) return { booking: existing, accessToken: bookingAccessToken(existing.id) };

    const ctx = await loadOffering(tx, input.offeringId);
    let travel = 0;
    let surcharge = 0;
    let zoneId: string | null = null;

    if (ctx.service.kind === "home_visit") {
      try {
        requireCapability(deps.compliance, "home_visits");
      } catch {
        throw new BookingError("home_visits_disabled", "Home visits are not currently available");
      }
      if (!input.home) throw new BookingError("invalid_input", "Home address required");
      const elig = await checkHomeEligibility(tx, input.home.lat, input.home.lng);
      if (!elig.eligible) throw new BookingError("outside_service_area");
      travel = elig.travelBufferMinutes;
      surcharge = elig.surchargeMinor;
      zoneId = elig.zoneId;
    }

    await expireStaleHolds(tx, now, ctx.offering.providerId);

    const localDate = utcToLocalDate(input.startsAt, ctx.facility?.timeZone ?? PRACTICE_TZ);
    const slots = await availableSlots(tx, { offeringId: input.offeringId, fromDate: localDate, days: 1, travelBufferMinutes: travel, now });
    const slot = slots.find((s) => s.start.getTime() === input.startsAt.getTime());
    if (!slot) throw new BookingError("slot_unavailable", "That time is no longer available");

    const base = ctx.offering.priceMinor;
    const prepay = ctx.facility?.paymentMode === "prepay" || ctx.service.kind === "home_visit";
    const values: typeof bookings.$inferInsert = {
      reference: newReference(),
      status: "hold",
      kind: ctx.service.kind,
      offeringId: ctx.offering.id,
      providerId: ctx.offering.providerId,
      facilityId: ctx.offering.facilityId,
      accountUserId: input.accountUserId ?? null,
      startsAt: slot.start,
      endsAt: slot.end,
      blockStartsAt: slot.blockStart,
      blockEndsAt: slot.blockEnd,
      holdExpiresAt: addMinutes(now, HOLD_MINUTES),
      homeZoneId: zoneId,
      homeAddressEnc: input.home ? encrypt(JSON.stringify({ address: input.home.address, accessNotes: input.home.accessNotes ?? "" })) : null,
      homeLat: input.home?.lat ?? null,
      homeLng: input.home?.lng ?? null,
      basePriceMinor: base,
      surchargeMinor: surcharge,
      totalMinor: base + surcharge,
      currency: ctx.offering.currency,
      paymentMode: prepay ? "prepay" : "pay_at_facility",
      attributionId: input.attributionId ?? null,
      idempotencyKey: input.idempotencyKey,
    };

    let booking: Booking;
    try {
      // Savepoint so an exclusion violation doesn't poison the outer transaction.
      booking = await tx.transaction(async (sp) => (await sp.insert(bookings).values(values).returning())[0]);
    } catch (err) {
      if (isExclusionViolation(err)) throw new BookingError("slot_unavailable", "That time was just taken");
      throw err;
    }
    await tx.insert(bookingEvents).values({ bookingId: booking.id, toStatus: "hold", actorType: "patient" });
    return { booking, accessToken: bookingAccessToken(booking.id) };
  });
}

// ─── Patient details & checkout ────────────────────────────────────────────────

export type PatientDetails = {
  fullName: string;
  email: string;
  phone: string;
  forSomeoneElse?: boolean;
  dateOfBirth?: string;
  acceptedPolicyVersion: string;
};

export async function getBookingForGuest(database: Db | Tx, bookingId: string, token: string | null | undefined) {
  if (!verifyBookingAccessToken(bookingId, token)) throw new BookingError("forbidden");
  const [b] = await database.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) throw new BookingError("not_found");
  return b;
}

export type CheckoutOutcome =
  | { type: "redirect"; url: string; booking: Booking }
  | { type: "requested"; booking: Booking };

/**
 * Attaches contact details and moves the hold forward:
 *  - prepay + payments enabled → Stripe Checkout (pending_payment)
 *  - otherwise → booking request awaiting facility confirmation (requested)
 */
export async function submitDetailsAndCheckout(deps: Deps, bookingId: string, token: string, details: PatientDetails): Promise<CheckoutOutcome> {
  const now = nowOf(deps);
  const payMode = paymentsEnabled(deps.compliance);

  const prepared = await deps.db.transaction(async (tx) => {
    const booking = await getBookingForGuest(tx, bookingId, token);
    if (booking.status === "pending_payment") {
      const [p] = await tx.select().from(payments).where(and(eq(payments.bookingId, booking.id), eq(payments.status, "open")));
      return { booking, existingPayment: p ?? null };
    }
    if (booking.status !== "hold") throw new BookingError("invalid_transition", `Booking is ${booking.status}`);
    if (booking.holdExpiresAt && booking.holdExpiresAt < now) throw new BookingError("hold_expired");

    const patch = {
      contactName: details.fullName.trim(),
      contactEmail: details.email.trim().toLowerCase(),
      contactPhone: details.phone.trim(),
    };

    if (booking.paymentMode === "pay_at_facility" || payMode === "disabled") {
      if (booking.kind === "home_visit") {
        // Home visits are always prepaid; without payments they cannot be booked online.
        throw new BookingError("home_visits_disabled", "Online payment is required for home visits and is not yet enabled");
      }
      const updated = await transition(tx, booking, "requested", { userId: null, role: "guest", type: "patient" }, { ...patch, holdExpiresAt: null, paymentMode: "pay_at_facility" });
      await afterBookingCreated(tx, deps, updated, "booking_requested");
      return { booking: updated, existingPayment: null, requested: true as const };
    }

    const updated = await transition(tx, booking, "pending_payment", { userId: null, role: "guest", type: "patient" }, {
      ...patch,
      holdExpiresAt: addMinutes(now, CHECKOUT_MINUTES + 5),
    });
    return { booking: updated, existingPayment: null };
  });

  if ("requested" in prepared) return { type: "requested", booking: prepared.booking };

  const booking = prepared.booking;
  const ctx = await loadOffering(deps.db, booking.offeringId);
  const checkout = await deps.gateway.createCheckout({
    bookingId: booking.id,
    reference: booking.reference,
    amountMinor: booking.totalMinor,
    currency: booking.currency,
    description: booking.kind === "home_visit" ? "Doctor home visit" : "Medical consultation",
    customerEmail: booking.contactEmail,
    captureMethod: ctx.facility?.captureMode === "automatic" && ctx.facility.confirmationMode === "auto_on_payment" ? "automatic" : "manual",
    successUrl: `${deps.baseUrl}/en/book/status/${booking.id}?t=${encodeURIComponent(token)}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${deps.baseUrl}/en/book/status/${booking.id}?t=${encodeURIComponent(token)}&cancelled=1`,
    expiresAt: addMinutes(now, CHECKOUT_MINUTES),
    idempotencyKey: `checkout:${booking.id}:${booking.version}`,
  });

  if (!prepared.existingPayment) {
    await deps.db
      .insert(payments)
      .values({
        bookingId: booking.id,
        checkoutSessionId: checkout.sessionId,
        amountMinor: booking.totalMinor,
        currency: booking.currency,
        livemode: checkout.livemode,
        merchantOfRecord: deps.compliance.merchantOfRecord ?? "UNCONFIGURED (test mode)",
      })
      .onConflictDoNothing({ target: payments.checkoutSessionId });
  }
  return { type: "redirect", url: checkout.url, booking };
}

async function afterBookingCreated(tx: Tx, deps: Deps, booking: Booking, patientTemplate: "booking_requested" | "booking_awaiting_confirmation" | "booking_confirmed") {
  const location = await locationLabel(tx, booking);
  const when = formatLocal(booking.startsAt);
  const { userId } = await linkBookingToAccount(tx, booking);
  const link = `${deps.baseUrl}/en/portal/appointments`;
  const params = { reference: booking.reference, when, location, link };
  await enqueue(tx, { dedupeKey: `${patientTemplate}:${booking.id}:email`, channel: "email", template: patientTemplate, recipientUserId: userId, recipientAddress: booking.contactEmail, params });
  if (deps.compliance.whatsappMode !== "disabled") {
    await enqueue(tx, { dedupeKey: `${patientTemplate}:${booking.id}:wa`, channel: "whatsapp", template: patientTemplate, recipientUserId: userId, recipientAddress: booking.contactPhone, params });
  }
  await enqueue(tx, { dedupeKey: `${patientTemplate}:${booking.id}:inapp`, channel: "in_app", template: patientTemplate, recipientUserId: userId, params });
  await notifyStaff(tx, deps, booking, when, location);
}

async function notifyStaff(tx: Tx, deps: Deps, booking: Booking, when: string, location: string) {
  const params = { reference: booking.reference, when, location, status: booking.status, link: `${deps.baseUrl}/admin/appointments/${booking.id}` };
  const emails = (process.env.STAFF_NOTIFY_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const to of emails) {
    await enqueue(tx, { dedupeKey: `staff_new_booking:${booking.id}:${booking.status}:${to}`, channel: "email", template: "staff_new_booking", recipientAddress: to, params });
  }
  const wa = (process.env.STAFF_NOTIFY_WHATSAPP ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (deps.compliance.whatsappMode !== "disabled") {
    for (const to of wa) {
      await enqueue(tx, { dedupeKey: `staff_new_booking:${booking.id}:${booking.status}:wa:${to}`, channel: "whatsapp", template: "staff_new_booking", recipientAddress: to, params });
    }
  }
}

export async function locationLabel(database: Db | Tx, booking: Pick<Booking, "kind" | "facilityId">): Promise<string> {
  if (booking.kind === "home_visit") return "Home visit";
  if (!booking.facilityId) return "Clinic";
  const [f] = await database.select({ name: facilities.name }).from(facilities).where(eq(facilities.id, booking.facilityId));
  return f?.name ?? "Clinic";
}

// ─── Payment events (called from the verified Stripe webhook) ──────────────────

export type PaymentSucceeded = {
  checkoutSessionId: string;
  paymentIntentId: string;
  amountMinor: number;
  currency: string;
  captured: boolean;
  livemode: boolean;
};

/**
 * Server-verified payment success. Idempotent: replays are no-ops.
 * A booking is only confirmed when the facility's confirmation rule is satisfied.
 */
export async function onCheckoutPaid(deps: Deps, evt: PaymentSucceeded) {
  const now = nowOf(deps);
  const result = await deps.db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.checkoutSessionId, evt.checkoutSessionId)).for("update");
    if (!payment) throw new BookingError("not_found", "Unknown checkout session");
    if (payment.status === "authorized" || payment.status === "succeeded") return { action: "noop" as const };
    if (evt.amountMinor !== payment.amountMinor || evt.currency.toUpperCase() !== payment.currency) {
      throw new Error(`Payment amount mismatch for ${payment.id}`);
    }
    await tx
      .update(payments)
      .set({ status: evt.captured ? "succeeded" : "authorized", paymentIntentId: evt.paymentIntentId, livemode: evt.livemode, updatedAt: now })
      .where(eq(payments.id, payment.id));

    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, payment.bookingId)).for("update");
    const ctx = await loadOffering(tx, booking.offeringId);
    const autoConfirm = ctx.facility?.confirmationMode === "auto_on_payment" && evt.captured;
    const target: BookingStatus = autoConfirm ? "confirmed" : "awaiting_confirmation";

    if (booking.status === "pending_payment" || booking.status === "expired" || booking.status === "hold") {
      try {
        const updated = await tx.transaction(async (sp) => {
          let b = booking;
          if (b.status === "hold") b = await transition(sp, b, "pending_payment", { userId: null, role: "stripe", type: "stripe" });
          return transition(sp, b, target, { userId: null, role: "stripe", type: "stripe" }, {
            holdExpiresAt: null,
            confirmedAt: autoConfirm ? now : null,
          }, "payment verified by webhook");
        });
        if (evt.captured) await issueInvoice(tx, deps, updated, payment.id);
        await afterBookingCreated(tx, deps, updated, autoConfirm ? "booking_confirmed" : "booking_awaiting_confirmation");
        await enqueue(tx, {
          dedupeKey: `payment_received:${payment.id}`,
          channel: "email",
          template: "payment_received",
          recipientAddress: updated.contactEmail,
          params: { reference: updated.reference, amount: formatMoney(evt.amountMinor, evt.currency), link: `${deps.baseUrl}/en/portal/payments` },
        });
        await audit(tx, { userId: null, role: "stripe", type: "stripe" }, "payment.verified", "booking", updated.id, { status: target });
        return { action: "activated" as const, bookingId: updated.id };
      } catch (err) {
        if (isExclusionViolation(err) || err instanceof BookingError) {
          // Slot was lost while the patient was paying (hold lapsed and someone else booked it).
          return { action: "release_payment" as const, bookingId: booking.id, paymentId: payment.id };
        }
        throw err;
      }
    }
    return { action: "noop" as const };
  });

  if (result.action === "release_payment") {
    await releaseLostSlotPayment(deps, result.bookingId, result.paymentId, evt.paymentIntentId, evt.captured);
  }
  return result;
}

async function releaseLostSlotPayment(deps: Deps, bookingId: string, paymentId: string, paymentIntentId: string, captured: boolean) {
  if (captured) {
    const [p] = await deps.db.select().from(payments).where(eq(payments.id, paymentId));
    await refundPayment(deps, SYSTEM, paymentId, p.amountMinor, "slot no longer available");
  } else {
    await deps.gateway.cancelAuthorization(paymentIntentId, `cancel:${paymentId}`);
    await deps.db.update(payments).set({ status: "cancelled", updatedAt: new Date() }).where(eq(payments.id, paymentId));
  }
  const [b] = await deps.db.select().from(bookings).where(eq(bookings.id, bookingId));
  await audit(deps.db, SYSTEM, "booking.slot_lost_after_payment", "booking", bookingId, { reference: b.reference });
  await enqueue(deps.db, {
    dedupeKey: `booking_cancelled:${bookingId}:slot_lost`,
    channel: "email",
    template: "booking_cancelled",
    recipientAddress: b.contactEmail,
    params: { reference: b.reference, link: `${deps.baseUrl}/en/book` },
  });
}

export async function onCheckoutExpired(deps: Deps, checkoutSessionId: string) {
  await deps.db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.checkoutSessionId, checkoutSessionId)).for("update");
    if (!payment || payment.status !== "open") return;
    await tx.update(payments).set({ status: "expired", updatedAt: new Date() }).where(eq(payments.id, payment.id));
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, payment.bookingId));
    if (booking?.status === "pending_payment") await transition(tx, booking, "expired", { userId: null, role: "stripe", type: "stripe" }, {}, "checkout expired");
  });
}

export async function onPaymentFailed(deps: Deps, paymentIntentId: string) {
  await deps.db.update(payments).set({ status: "failed", updatedAt: new Date() }).where(and(eq(payments.paymentIntentId, paymentIntentId), eq(payments.status, "open")));
}

export async function onChargeRefunded(deps: Deps, paymentIntentId: string, amountRefundedMinor: number) {
  const [p] = await deps.db.select().from(payments).where(eq(payments.paymentIntentId, paymentIntentId));
  if (!p) return;
  await deps.db
    .update(payments)
    .set({ amountRefundedMinor: amountRefundedMinor, status: amountRefundedMinor >= p.amountMinor ? "refunded" : "partially_refunded", updatedAt: new Date() })
    .where(eq(payments.id, p.id));
}

// ─── Staff actions ────────────────────────────────────────────────────────────

async function lockBooking(tx: Tx, bookingId: string) {
  const [b] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).for("update");
  if (!b) throw new BookingError("not_found");
  return b;
}

export async function confirmBooking(deps: Deps, actor: Actor, bookingId: string) {
  const now = nowOf(deps);
  // Capture first (outside the DB transaction); Stripe idempotency makes retries safe.
  const [pay] = await deps.db.select().from(payments).where(and(eq(payments.bookingId, bookingId), eq(payments.status, "authorized")));
  if (pay?.paymentIntentId) {
    await deps.gateway.capture(pay.paymentIntentId, `capture:${pay.id}`);
    await deps.db.update(payments).set({ status: "succeeded", updatedAt: now }).where(eq(payments.id, pay.id));
  }
  return deps.db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    const updated = await transition(tx, b, "confirmed", actor, { confirmedAt: now, confirmedBy: actor.userId });
    if (pay) await issueInvoice(tx, deps, updated, pay.id);
    const location = await locationLabel(tx, updated);
    const params = { reference: updated.reference, when: formatLocal(updated.startsAt), location, link: `${deps.baseUrl}/en/portal/appointments` };
    await enqueue(tx, { dedupeKey: `booking_confirmed:${updated.id}:email`, channel: "email", template: "booking_confirmed", recipientUserId: updated.accountUserId, recipientAddress: updated.contactEmail, params });
    if (deps.compliance.whatsappMode !== "disabled") {
      await enqueue(tx, { dedupeKey: `booking_confirmed:${updated.id}:wa`, channel: "whatsapp", template: "booking_confirmed", recipientUserId: updated.accountUserId, recipientAddress: updated.contactPhone, params });
    }
    await scheduleReminders(tx, updated, params);
    await audit(tx, actor, "booking.confirm", "booking", updated.id);
    await markCalendarDirty(tx, updated.id);
    return updated;
  });
}

async function scheduleReminders(tx: Tx, b: Booking, params: Record<string, string>) {
  const at = applyQuietHours(addMinutes(b.startsAt, -24 * 60), false);
  if (at > new Date()) {
    await enqueue(tx, { dedupeKey: `booking_reminder:${b.id}:${b.startsAt.toISOString()}:email`, channel: "email", template: "booking_reminder", recipientUserId: b.accountUserId, recipientAddress: b.contactEmail, params, notBefore: at });
  }
}

async function markCalendarDirty(tx: Tx, bookingId: string) {
  const [b] = await tx.select({ providerId: bookings.providerId }).from(bookings).where(eq(bookings.id, bookingId));
  const [conn] = await tx.select().from(calendarConnections).where(and(eq(calendarConnections.providerId, b.providerId), eq(calendarConnections.status, "active")));
  if (!conn) return;
  await tx
    .insert(calendarEventLinks)
    .values({ bookingId, connectionId: conn.id, desiredVersion: 1 })
    .onConflictDoUpdate({ target: calendarEventLinks.bookingId, set: { desiredVersion: sql`${calendarEventLinks.desiredVersion} + 1`, updatedAt: new Date() } });
}

export type CancelOutcome = { booking: Booking; refundMinor: number };

/** Refund policy: full refund up to freeCancelHours before start; then lateCancelRefundPercent. Staff/facility cancellations always refund in full. */
export function refundAmountFor(b: Pick<Booking, "startsAt" | "totalMinor">, policy: { freeCancelHours: number; lateCancelRefundPercent: number }, now: Date, initiatedBy: "patient" | "staff"): number {
  if (initiatedBy === "staff") return b.totalMinor;
  const hours = (b.startsAt.getTime() - now.getTime()) / 3_600_000;
  if (hours >= policy.freeCancelHours) return b.totalMinor;
  return Math.floor((b.totalMinor * policy.lateCancelRefundPercent) / 100);
}

export async function cancelBooking(deps: Deps, actor: Actor, bookingId: string, reason: string): Promise<CancelOutcome> {
  const now = nowOf(deps);
  const { booking, payment, refundMinor } = await deps.db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (actor.type === "patient" && b.accountUserId !== actor.userId) throw new BookingError("forbidden");
    if (actor.type === "patient" && b.startsAt <= now) throw new BookingError("invalid_transition", "Appointment already started");
    const updated = await transition(tx, b, "cancelled", actor, { cancelledAt: now, cancelReason: reason.slice(0, 500) });
    const [pay] = await tx.select().from(payments).where(and(eq(payments.bookingId, b.id), inArray(payments.status, ["authorized", "succeeded"])));
    const [fac] = b.facilityId ? await tx.select().from(facilities).where(eq(facilities.id, b.facilityId)) : [null];
    const policy = (fac?.cancellationPolicy as { freeCancelHours: number; lateCancelRefundPercent: number }) ?? { freeCancelHours: 24, lateCancelRefundPercent: 0 };
    const refundMinor = pay ? refundAmountFor(b, policy, now, actor.type === "patient" ? "patient" : "staff") : 0;
    await enqueue(tx, {
      dedupeKey: `booking_cancelled:${b.id}:email`,
      channel: "email",
      template: "booking_cancelled",
      recipientUserId: b.accountUserId,
      recipientAddress: b.contactEmail,
      params: { reference: b.reference, link: `${deps.baseUrl}/en/portal/appointments` },
    });
    await audit(tx, actor, "booking.cancel", "booking", b.id, { refundMinor });
    await markCalendarDirty(tx, b.id);
    return { booking: updated, payment: pay ?? null, refundMinor };
  });

  if (payment) {
    if (payment.status === "authorized" && payment.paymentIntentId) {
      await deps.gateway.cancelAuthorization(payment.paymentIntentId, `cancel:${payment.id}`);
      await deps.db.update(payments).set({ status: "cancelled", updatedAt: now }).where(eq(payments.id, payment.id));
    } else if (refundMinor > 0) {
      await refundPayment(deps, actor, payment.id, refundMinor, reason);
    }
  }
  return { booking, refundMinor };
}

export async function refundPayment(deps: Deps, actor: Actor, paymentId: string, amountMinor: number, reason: string) {
  const [p] = await deps.db.select().from(payments).where(eq(payments.id, paymentId));
  if (!p?.paymentIntentId) throw new BookingError("not_found", "Payment not captured");
  const remaining = p.amountMinor - p.amountRefundedMinor;
  if (amountMinor <= 0 || amountMinor > remaining) throw new BookingError("invalid_input", "Refund exceeds remaining amount");
  const [{ n }] = await deps.db.select({ n: sql<number>`count(*)::int` }).from(refunds).where(eq(refunds.paymentId, paymentId));
  const idem = `refund:${paymentId}:${n + 1}:${amountMinor}`;
  const r = await deps.gateway.refund(p.paymentIntentId, amountMinor, idem);
  await deps.db.transaction(async (tx) => {
    await tx.insert(refunds).values({ paymentId, stripeRefundId: r.refundId, amountMinor, reason, status: r.status, requestedBy: actor.userId, idempotencyKey: idem }).onConflictDoNothing();
    const total = p.amountRefundedMinor + amountMinor;
    await tx.update(payments).set({ amountRefundedMinor: total, status: total >= p.amountMinor ? "refunded" : "partially_refunded", updatedAt: new Date() }).where(eq(payments.id, paymentId));
    const [b] = await tx.select().from(bookings).where(eq(bookings.id, p.bookingId));
    await enqueue(tx, {
      dedupeKey: `refund_issued:${r.refundId}`,
      channel: "email",
      template: "refund_issued",
      recipientAddress: b.contactEmail,
      params: { reference: b.reference, amount: formatMoney(amountMinor, p.currency), link: `${deps.baseUrl}/en/portal/payments` },
    });
    await audit(tx, actor, "payment.refund", "payment", paymentId, { amountMinor });
  });
}

/** Moves an appointment to a new time. Payment and history carry over; the old slot is freed atomically. */
export async function rescheduleBooking(deps: Deps, actor: Actor, bookingId: string, newStart: Date) {
  const now = nowOf(deps);
  return deps.db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (actor.type === "patient" && b.accountUserId !== actor.userId) throw new BookingError("forbidden");
    if (!["confirmed", "awaiting_confirmation", "requested"].includes(b.status)) throw new BookingError("invalid_transition");
    const [zone] = b.homeZoneId ? await tx.select().from(homeVisitZones).where(eq(homeVisitZones.id, b.homeZoneId)) : [null];
    const slots = await availableSlots(tx, {
      offeringId: b.offeringId,
      fromDate: utcToLocalDate(newStart),
      days: 1,
      travelBufferMinutes: zone?.travelBufferMinutes ?? 0,
      now,
      excludeBookingId: b.id,
    });
    const slot = slots.find((s) => s.start.getTime() === newStart.getTime());
    if (!slot) throw new BookingError("slot_unavailable");
    const ctx = await loadOffering(tx, b.offeringId);
    const needsReconfirm = ctx.facility?.confirmationMode === "manual_staff" && actor.type === "patient";
    let updated: Booking;
    try {
      updated = await tx.transaction(async (sp) => {
        const rows = await sp
          .update(bookings)
          .set({
            startsAt: slot.start,
            endsAt: slot.end,
            blockStartsAt: slot.blockStart,
            blockEndsAt: slot.blockEnd,
            status: needsReconfirm && b.status === "confirmed" ? "awaiting_confirmation" : b.status,
            version: b.version + 1,
            updatedAt: now,
          })
          .where(and(eq(bookings.id, b.id), eq(bookings.version, b.version)))
          .returning();
        if (rows.length !== 1) throw new BookingError("concurrent_update");
        return rows[0];
      });
    } catch (err) {
      if (isExclusionViolation(err)) throw new BookingError("slot_unavailable");
      throw err;
    }
    await tx.insert(bookingEvents).values({ bookingId: b.id, fromStatus: b.status, toStatus: updated.status, actorUserId: actor.userId, actorType: actor.type, note: `rescheduled from ${b.startsAt.toISOString()}` });
    const location = await locationLabel(tx, updated);
    await enqueue(tx, {
      dedupeKey: `booking_rescheduled:${b.id}:${updated.version}`,
      channel: "email",
      template: "booking_rescheduled",
      recipientUserId: updated.accountUserId,
      recipientAddress: updated.contactEmail,
      params: { reference: updated.reference, when: formatLocal(updated.startsAt), location, link: `${deps.baseUrl}/en/portal/appointments` },
    });
    await audit(tx, actor, "booking.reschedule", "booking", b.id, { from: b.startsAt.toISOString(), to: updated.startsAt.toISOString() });
    await markCalendarDirty(tx, b.id);
    return updated;
  });
}

export async function completeBooking(deps: Deps, actor: Actor, bookingId: string, outcome: "completed" | "no_show") {
  return deps.db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    const updated = await transition(tx, b, outcome, actor, outcome === "completed" ? { completedAt: nowOf(deps) } : {});
    await audit(tx, actor, `booking.${outcome}`, "booking", b.id);
    return updated;
  });
}

/** Staff override: books an arbitrary time (e.g. phone booking) bypassing rules but never the overlap constraint. */
export async function staffCreateBooking(
  deps: Deps,
  actor: Actor,
  input: { offeringId: string; startsAt: Date; contactName: string; contactEmail: string; contactPhone: string; reason: string },
) {
  return deps.db.transaction(async (tx) => {
    const ctx = await loadOffering(tx, input.offeringId);
    const dur = ctx.offering.durationMinutes ?? ctx.service.durationMinutes;
    const end = addMinutes(input.startsAt, dur);
    try {
      const [b] = await tx.transaction(async (sp) =>
        sp
          .insert(bookings)
          .values({
            reference: newReference(),
            status: "confirmed",
            kind: ctx.service.kind,
            offeringId: ctx.offering.id,
            providerId: ctx.offering.providerId,
            facilityId: ctx.offering.facilityId,
            startsAt: input.startsAt,
            endsAt: end,
            blockStartsAt: addMinutes(input.startsAt, -ctx.offering.bufferBeforeMinutes),
            blockEndsAt: addMinutes(end, ctx.offering.bufferAfterMinutes),
            contactName: input.contactName,
            contactEmail: input.contactEmail.toLowerCase(),
            contactPhone: input.contactPhone,
            basePriceMinor: ctx.offering.priceMinor,
            totalMinor: ctx.offering.priceMinor,
            paymentMode: "pay_at_facility",
            idempotencyKey: `staff:${actor.userId}:${input.offeringId}:${input.startsAt.toISOString()}`,
            confirmedAt: new Date(),
            confirmedBy: actor.userId,
          })
          .returning(),
      );
      await tx.insert(bookingEvents).values({ bookingId: b.id, toStatus: "confirmed", actorUserId: actor.userId, actorType: "staff", note: `override: ${input.reason}` });
      await audit(tx, actor, "booking.override_create", "booking", b.id, { reason: input.reason });
      await linkBookingToAccount(tx, b);
      await markCalendarDirty(tx, b.id);
      return b;
    } catch (err) {
      if (isExclusionViolation(err)) throw new BookingError("slot_unavailable", "Conflicts with an existing appointment");
      throw err;
    }
  });
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

async function issueInvoice(tx: Tx, deps: Deps, b: Booking, paymentId: string) {
  const [existing] = await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.paymentId, paymentId));
  if (existing) return;
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(invoices);
  const year = new Date().getUTCFullYear();
  const lines = [
    { description: b.kind === "home_visit" ? "Doctor home visit" : "Medical consultation", amountMinor: b.basePriceMinor },
    ...(b.surchargeMinor ? [{ description: "Home-visit travel surcharge", amountMinor: b.surchargeMinor }] : []),
  ];
  await tx.insert(invoices).values({
    number: `INV-${year}-${String(n + 1).padStart(6, "0")}`,
    bookingId: b.id,
    paymentId,
    issuerLegalEntity: deps.compliance.merchantOfRecord ?? "UNCONFIGURED — test invoice",
    billToName: b.contactName ?? "Patient",
    lines,
    subtotalMinor: b.totalMinor,
    // Healthcare services are generally zero-rated for UAE VAT; confirm with the merchant of record's tax advisor.
    vatMinor: 0,
    totalMinor: b.totalMinor,
    currency: b.currency,
  });
}

/** Upcoming bookings for admin lists. */
export async function bookingsBetween(database: Db, from: Date, to: Date) {
  return database
    .select()
    .from(bookings)
    .where(and(gte(bookings.startsAt, from), lte(bookings.startsAt, to), or(inArray(bookings.status, ACTIVE_STATUSES), inArray(bookings.status, ["completed", "no_show"]))))
    .orderBy(bookings.startsAt);
}
