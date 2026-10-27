"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { consents, dataRequests, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { actorOf, clearSessionCookie, requirePatient } from "@/server/auth/session";
import { cancelBooking, rescheduleBooking, BookingError } from "@/server/booking/engine";
import { bookingDeps } from "@/server/deps";
import { revokeAllSessions } from "@/server/auth/core";
import { audit } from "@/server/audit";

export type ActionState = { ok?: boolean; error?: string } | null;

export async function cancelAppointment(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requirePatient();
  const id = z.uuid().parse(form.get("bookingId"));
  const reason = String(form.get("reason") ?? "").slice(0, 300) || "Cancelled by patient";
  try {
    await cancelBooking(await bookingDeps(), actorOf(user), id, reason);
  } catch (e) {
    return { error: e instanceof BookingError ? e.code : "failed" };
  }
  revalidatePath("/[locale]/portal", "layout");
  return { ok: true };
}

export async function rescheduleAppointment(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requirePatient();
  const id = z.uuid().parse(form.get("bookingId"));
  const startsAt = z.iso.datetime().parse(form.get("startsAt"));
  try {
    await rescheduleBooking(await bookingDeps(), actorOf(user), id, new Date(startsAt));
  } catch (e) {
    return { error: e instanceof BookingError ? e.code : "failed" };
  }
  revalidatePath("/[locale]/portal", "layout");
  return { ok: true };
}

export async function updateProfile(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requirePatient();
  const parsed = z
    .object({ displayName: z.string().trim().min(2).max(120), phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/), locale: z.enum(["en", "ar"]) })
    .safeParse({ displayName: form.get("displayName"), phone: form.get("phone"), locale: form.get("locale") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid" };
  // A changed phone number is unverified until confirmed.
  const [current] = await db().select().from(users).where(eq(users.id, user.userId));
  await db()
    .update(users)
    .set({ ...parsed.data, phoneVerifiedAt: current.phone === parsed.data.phone ? current.phoneVerifiedAt : null, updatedAt: new Date() })
    .where(eq(users.id, user.userId));
  await audit(db(), actorOf(user), "profile.update", "user", user.userId);
  revalidatePath("/[locale]/portal/settings", "page");
  return { ok: true };
}

export async function updateCommunicationConsent(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requirePatient();
  const version = "2026-10";
  await db().insert(consents).values([
    { userId: user.userId, purpose: "whatsapp_notifications", granted: form.get("whatsapp") === "on", documentVersion: version, source: "portal_settings" },
    { userId: user.userId, purpose: "marketing_messages", granted: form.get("marketing") === "on", documentVersion: version, source: "portal_settings" },
  ]);
  revalidatePath("/[locale]/portal/settings", "page");
  return { ok: true };
}

export async function requestData(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requirePatient();
  const type = z.enum(["access", "deletion", "correction"]).parse(form.get("type"));
  await db().insert(dataRequests).values({ userId: user.userId, type, notes: String(form.get("notes") ?? "").slice(0, 1000) || null });
  if (type === "deletion") await db().update(users).set({ deletionRequestedAt: new Date() }).where(eq(users.id, user.userId));
  await audit(db(), actorOf(user), `data_request.${type}`, "user", user.userId);
  return { ok: true };
}

export async function signOutEverywhere() {
  const user = await requirePatient();
  await revokeAllSessions(db(), user.userId);
  await clearSessionCookie();
  redirect("/en/login");
}
