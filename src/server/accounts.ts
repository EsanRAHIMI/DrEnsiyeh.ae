import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { bookings, patients, users } from "@/db/schema";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Creates or links the patient account for a booking.
 *
 * Safety rules:
 *  - Matching is by normalised email only. The account is NOT verified by this step; the
 *    holder must prove control of the email via a one-time code before anything is visible.
 *  - A booking only ever links to a patient profile owned by the account. Clinical records stay
 *    hidden until staff verify identity in person (patients.identityVerifiedAt).
 *  - Never creates or sends a password.
 */
export async function linkBookingToAccount(tx: Tx, booking: typeof bookings.$inferSelect): Promise<{ userId: string | null; patientId: string | null; created: boolean }> {
  if (!booking.contactEmail) return { userId: booking.accountUserId, patientId: booking.patientId, created: false };
  if (booking.accountUserId && booking.patientId) return { userId: booking.accountUserId, patientId: booking.patientId, created: false };

  const email = normalizeEmail(booking.contactEmail);
  let created = false;
  let userId = booking.accountUserId;
  if (!userId) {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existing) userId = existing.id;
    else {
      const [u] = await tx
        .insert(users)
        .values({ email, phone: booking.contactPhone, displayName: booking.contactName, roles: ["patient"] })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id });
      userId = u?.id ?? (await tx.select({ id: users.id }).from(users).where(eq(users.email, email)))[0].id;
      created = true;
    }
  }

  // Reuse the account's own "self" profile when the name matches; otherwise create a separate,
  // unverified profile (e.g. booking on behalf of a family member — guardian verification required).
  const owned = await tx.select().from(patients).where(eq(patients.accountUserId, userId));
  const nameKey = (s: string | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  let patient = owned.find((p) => nameKey(p.fullName) === nameKey(booking.contactName));
  if (!patient) {
    const hasSelf = owned.some((p) => p.relationship === "self");
    [patient] = await tx
      .insert(patients)
      .values({
        accountUserId: userId,
        relationship: hasSelf ? "dependent" : "self",
        fullName: booking.contactName ?? "Patient",
        email,
        phone: booking.contactPhone,
      })
      .returning();
  }
  await tx.update(bookings).set({ accountUserId: userId, patientId: patient.id }).where(and(eq(bookings.id, booking.id)));
  return { userId, patientId: patient.id, created };
}
