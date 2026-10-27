import "server-only";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { bookings, clinicalNotes, documents, facilities, invoices, notifications, patients, payments, services, offerings, users } from "@/db/schema";
import { decryptJson } from "@/lib/crypto";
import { capabilityBlockers, getCompliance } from "@/server/compliance";
import type { SessionUser } from "@/server/auth/core";

export async function patientBookings(user: SessionUser) {
  return db()
    .select({ b: bookings, facilityName: facilities.name, serviceName: services.name, serviceSlug: services.slug })
    .from(bookings)
    .innerJoin(offerings, eq(offerings.id, bookings.offeringId))
    .innerJoin(services, eq(services.id, offerings.serviceId))
    .leftJoin(facilities, eq(facilities.id, bookings.facilityId))
    .where(and(eq(bookings.accountUserId, user.userId), inArray(bookings.status, ["requested", "awaiting_confirmation", "confirmed", "completed", "cancelled", "no_show"])))
    .orderBy(desc(bookings.startsAt));
}

export async function patientBooking(user: SessionUser, id: string) {
  const rows = await patientBookings(user);
  return rows.find((r) => r.b.id === id) ?? null;
}

export async function patientPayments(user: SessionUser) {
  return db()
    .select({ p: payments, reference: bookings.reference, invoiceNumber: invoices.number, invoiceId: invoices.id })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .leftJoin(invoices, eq(invoices.paymentId, payments.id))
    .where(eq(bookings.accountUserId, user.userId))
    .orderBy(desc(payments.createdAt));
}

export async function patientInvoice(user: SessionUser, invoiceId: string) {
  const [row] = await db()
    .select({ i: invoices, b: bookings })
    .from(invoices)
    .innerJoin(bookings, eq(bookings.id, invoices.bookingId))
    .where(and(eq(invoices.id, invoiceId), eq(bookings.accountUserId, user.userId)));
  return row ?? null;
}

export type ClinicalAccess = { allowed: true; patientIds: string[] } | { allowed: false; reason: string };

/**
 * A patient may see clinical items only when ALL hold:
 *  - clinical records capability is authorised,
 *  - the account's email is verified,
 *  - the patient profile is owned by the account and identity-verified by staff in person,
 *  - for dependents, guardianship has been verified.
 * Only signed, patient-visible items are ever returned.
 */
export async function clinicalAccess(user: SessionUser): Promise<ClinicalAccess> {
  const compliance = await getCompliance(db());
  if (capabilityBlockers(compliance, "emr_reference").length) return { allowed: false, reason: "Medical records are not yet available online." };
  if (!user.emailVerified) return { allowed: false, reason: "Please verify your email to access records." };
  const owned = await db().select().from(patients).where(and(eq(patients.accountUserId, user.userId), isNotNull(patients.identityVerifiedAt)));
  const ids = owned.filter((p) => p.relationship === "self" || p.guardianVerifiedAt).map((p) => p.id);
  if (!ids.length) return { allowed: false, reason: "Your identity needs to be confirmed at your next visit before documents can be shown here." };
  return { allowed: true, patientIds: ids };
}

export async function patientVisibleRecords(user: SessionUser) {
  const access = await clinicalAccess(user);
  if (!access.allowed) return { access, notes: [], docs: [] };
  const notes = await db()
    .select()
    .from(clinicalNotes)
    .where(and(inArray(clinicalNotes.patientId, access.patientIds), eq(clinicalNotes.patientVisible, true), isNotNull(clinicalNotes.signedAt), inArray(clinicalNotes.type, ["visit_summary", "follow_up", "treatment_plan"])))
    .orderBy(desc(clinicalNotes.createdAt));
  // Hide superseded versions.
  const superseded = new Set(notes.map((n) => n.supersedesId).filter(Boolean));
  const docs = await db()
    .select()
    .from(documents)
    .where(and(inArray(documents.patientId, access.patientIds), eq(documents.patientVisible, true)))
    .orderBy(desc(documents.createdAt));
  return {
    access,
    notes: notes.filter((n) => !superseded.has(n.id)).map((n) => ({ ...n, body: decryptJson<{ title?: string; text: string }>(n.bodyEnc) })),
    docs,
  };
}

export async function inAppNotifications(user: SessionUser) {
  return db().select().from(notifications).where(and(eq(notifications.recipientUserId, user.userId), eq(notifications.channel, "in_app"))).orderBy(desc(notifications.createdAt)).limit(20);
}

export async function profileOf(user: SessionUser) {
  const [u] = await db().select().from(users).where(eq(users.id, user.userId));
  const profiles = await db().select().from(patients).where(eq(patients.accountUserId, user.userId));
  return { user: u, profiles };
}
