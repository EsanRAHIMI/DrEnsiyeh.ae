"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { availabilityExceptions, availabilityRules, documents, facilities, homeVisitZones, offerings, settings, users } from "@/db/schema";
import { actorOf, requireStaff } from "@/server/auth/session";
import type { Permission, Role } from "@/lib/rbac";
import { BookingError, cancelBooking, completeBooking, confirmBooking, refundPayment, rescheduleBooking, staffCreateBooking } from "@/server/booking/engine";
import { bookingDeps } from "@/server/deps";
import { amendNote, createNote, RecordsError, signNote, verifyGuardian, verifyPatientIdentity } from "@/server/emr/records";
import { complianceSchema, getCompliance, requireCapability, CapabilityDisabledError } from "@/server/compliance";
import { audit } from "@/server/audit";
import { localToUtc } from "@/lib/time";
import { putObject } from "@/server/storage";
import { randomUUID } from "node:crypto";

export type Result = { ok?: boolean; error?: string } | null;

async function staff(perm: Permission) {
  const u = await requireStaff(perm);
  return { u, actor: { ...actorOf(u), roles: u.roles as Role[] } };
}

function fail(e: unknown): Result {
  if (e instanceof BookingError) return { error: e.message !== e.code ? e.message : e.code.replace(/_/g, " ") };
  if (e instanceof RecordsError || e instanceof CapabilityDisabledError) return { error: e.message };
  if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Invalid input" };
  console.error("[admin action]", e instanceof Error ? e.message : e);
  return { error: "Something went wrong" };
}

// ─── Appointments ─────────────────────────────────────────────────────────────

export async function appointmentAction(_: Result, form: FormData): Promise<Result> {
  const id = z.uuid().parse(form.get("bookingId"));
  const op = z.enum(["confirm", "decline", "cancel", "complete", "no_show", "reschedule"]).parse(form.get("op"));
  try {
    const { actor } = await staff(op === "complete" || op === "no_show" ? "appointments:manage" : "appointments:manage");
    const deps = await bookingDeps();
    if (op === "confirm") await confirmBooking(deps, actor, id);
    if (op === "decline" || op === "cancel") await cancelBooking(deps, actor, id, String(form.get("reason") ?? (op === "decline" ? "Declined by facility" : "Cancelled by practice")));
    if (op === "complete") await completeBooking(deps, actor, id, "completed");
    if (op === "no_show") await completeBooking(deps, actor, id, "no_show");
    if (op === "reschedule") {
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(form.get("date"));
      const time = z.string().regex(/^\d{2}:\d{2}$/).parse(form.get("time"));
      await rescheduleBooking(deps, actor, id, localToUtc(date, time));
    }
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function createStaffBooking(_: Result, form: FormData): Promise<Result> {
  let id: string;
  try {
    const { actor } = await staff("appointments:override");
    const p = z
      .object({
        offeringId: z.uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: z.string().regex(/^\d{2}:\d{2}$/),
        contactName: z.string().min(2),
        contactEmail: z.email(),
        contactPhone: z.string().min(7),
        reason: z.string().min(3, "Give a reason for the override"),
      })
      .parse(Object.fromEntries(form));
    const b = await staffCreateBooking(await bookingDeps(), actor, { ...p, startsAt: localToUtc(p.date, p.time) });
    id = b.id;
  } catch (e) {
    return fail(e);
  }
  redirect(`/admin/appointments/${id}`);
}

export async function refundAction(_: Result, form: FormData): Promise<Result> {
  try {
    const { actor } = await staff("payments:refund");
    const paymentId = z.uuid().parse(form.get("paymentId"));
    const amount = Math.round(z.coerce.number().positive().parse(form.get("amount")) * 100);
    await refundPayment(await bookingDeps(), actor, paymentId, amount, String(form.get("reason") ?? "Manual refund"));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

// ─── Patients & records ───────────────────────────────────────────────────────

export async function verifyIdentityAction(_: Result, form: FormData): Promise<Result> {
  try {
    const { actor } = await staff("appointments:manage");
    await verifyPatientIdentity(db(), actor, z.uuid().parse(form.get("patientId")), z.string().min(2).parse(form.get("method")));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin/patients", "layout");
  return { ok: true };
}

export async function verifyGuardianAction(_: Result, form: FormData): Promise<Result> {
  try {
    const { actor } = await staff("appointments:override");
    await verifyGuardian(db(), actor, z.uuid().parse(form.get("patientId")), z.string().min(3).parse(form.get("evidence")));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin/patients", "layout");
  return { ok: true };
}

export async function noteAction(_: Result, form: FormData): Promise<Result> {
  try {
    const { actor } = await staff("clinical:write");
    const compliance = await getCompliance(db());
    const op = z.enum(["create", "sign", "amend"]).parse(form.get("op"));
    if (op === "create") {
      await createNote(db(), compliance, actor, {
        patientId: z.uuid().parse(form.get("patientId")),
        bookingId: (form.get("bookingId") as string) || null,
        type: z.enum(["history", "allergy", "medication", "visit_note", "treatment_plan", "follow_up", "visit_summary"]).parse(form.get("type")),
        body: { title: String(form.get("title") ?? "") || undefined, text: z.string().min(1).parse(form.get("text")) },
        patientVisible: form.get("patientVisible") === "on",
        sign: form.get("sign") === "on",
      });
    } else if (op === "sign") {
      await signNote(db(), actor, z.uuid().parse(form.get("noteId")));
    } else {
      await amendNote(db(), actor, z.uuid().parse(form.get("noteId")), { text: z.string().min(1).parse(form.get("text")) }, String(form.get("reason") ?? ""));
    }
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin/patients", "layout");
  return { ok: true };
}

const MAX_UPLOAD = 15 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];

export async function uploadDocumentAction(_: Result, form: FormData): Promise<Result> {
  try {
    const { actor } = await staff("clinical:write");
    requireCapability(await getCompliance(db()), "emr_reference");
    const patientId = z.uuid().parse(form.get("patientId"));
    const file = form.get("file");
    const externalReference = String(form.get("externalReference") ?? "").trim();
    let stored: { storageKey: string; sha256: string; sizeBytes: number; contentType: string } | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_UPLOAD) return { error: "File too large (15 MB max)" };
      if (!ALLOWED.includes(file.type)) return { error: "Only PDF, JPEG or PNG files" };
      const key = `patients/${patientId}/${randomUUID()}`;
      const meta = await putObject(key, Buffer.from(await file.arrayBuffer()));
      stored = { storageKey: key, contentType: file.type, ...meta };
    } else if (!externalReference) return { error: "Attach a file or enter the facility EMR reference" };
    const [doc] = await db()
      .insert(documents)
      .values({
        patientId,
        category: z.enum(["lab_report", "diagnostic_report", "referral", "other"]).parse(form.get("category")),
        title: z.string().min(2).max(200).parse(form.get("title")),
        storageKey: stored?.storageKey ?? null,
        contentType: stored?.contentType ?? null,
        sizeBytes: stored?.sizeBytes ?? null,
        sha256: stored?.sha256 ?? null,
        externalReference: externalReference || null,
        patientVisible: form.get("patientVisible") === "on",
        uploadedBy: actor.userId,
      })
      .returning({ id: documents.id });
    await audit(db(), actor, "document.upload", "document", doc.id, { patientId });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin/patients", "layout");
  return { ok: true };
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

export async function scheduleAction(_: Result, form: FormData): Promise<Result> {
  try {
    const { actor } = await staff("availability:manage");
    const op = z.enum(["add_rule", "delete_rule", "add_block", "delete_block"]).parse(form.get("op"));
    if (op === "add_rule") {
      const p = z
        .object({
          providerId: z.uuid(),
          facilityId: z.string().optional(),
          kind: z.enum(["clinic", "home_visit"]),
          weekday: z.coerce.number().int().min(0).max(6),
          startTime: z.string().regex(/^\d{2}:\d{2}$/),
          endTime: z.string().regex(/^\d{2}:\d{2}$/),
          slotStepMinutes: z.coerce.number().int().min(5).max(120),
        })
        .refine((v) => v.endTime > v.startTime, "End must be after start")
        .parse(Object.fromEntries(form));
      await db().insert(availabilityRules).values({ ...p, facilityId: p.kind === "clinic" ? p.facilityId || null : null });
    } else if (op === "delete_rule") {
      await db().delete(availabilityRules).where(eq(availabilityRules.id, z.uuid().parse(form.get("id"))));
    } else if (op === "add_block") {
      const p = z.object({ providerId: z.uuid(), date: z.string(), from: z.string(), to: z.string(), reason: z.string().max(200).optional() }).parse(Object.fromEntries(form));
      await db().insert(availabilityExceptions).values({ providerId: p.providerId, type: "block", startsAt: localToUtc(p.date, p.from), endsAt: localToUtc(p.date, p.to), reason: p.reason ?? null, createdBy: actor.userId });
    } else {
      await db().delete(availabilityExceptions).where(eq(availabilityExceptions.id, z.uuid().parse(form.get("id"))));
    }
    await audit(db(), actor, `schedule.${op}`, "schedule", null);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin/schedule");
  return { ok: true };
}

// ─── Pricing & facilities ─────────────────────────────────────────────────────

export async function pricingAction(_: Result, form: FormData): Promise<Result> {
  try {
    const { actor } = await staff("pricing:manage");
    const op = z.enum(["offering", "facility", "zone"]).parse(form.get("op"));
    if (op === "offering") {
      const p = z
        .object({ id: z.uuid(), price: z.coerce.number().nonnegative(), minNoticeMinutes: z.coerce.number().int().min(0), bufferAfterMinutes: z.coerce.number().int().min(0), active: z.string().optional() })
        .parse(Object.fromEntries(form));
      const [before] = await db().select().from(offerings).where(eq(offerings.id, p.id));
      await db().update(offerings).set({ priceMinor: Math.round(p.price * 100), minNoticeMinutes: p.minNoticeMinutes, bufferAfterMinutes: p.bufferAfterMinutes, active: p.active === "on" }).where(eq(offerings.id, p.id));
      await audit(db(), actor, "pricing.update", "offering", p.id, { fromMinor: before.priceMinor, toMinor: Math.round(p.price * 100) });
    } else if (op === "facility") {
      const p = z
        .object({
          id: z.uuid(),
          name: z.string().min(2),
          addressLine: z.string().optional(),
          legalEntityName: z.string().optional(),
          dhaFacilityLicense: z.string().optional(),
          confirmationMode: z.enum(["auto_on_payment", "manual_staff"]),
          paymentMode: z.enum(["prepay", "pay_at_facility"]),
          captureMode: z.enum(["automatic", "on_confirmation"]),
          freeCancelHours: z.coerce.number().int().min(0),
          lateCancelRefundPercent: z.coerce.number().int().min(0).max(100),
          physicianSharePercent: z.string().optional(),
          insuranceNote: z.string().optional(),
        })
        .parse(Object.fromEntries(form));
      await db()
        .update(facilities)
        .set({
          name: p.name,
          addressLine: p.addressLine || null,
          legalEntityName: p.legalEntityName || null,
          dhaFacilityLicense: p.dhaFacilityLicense || null,
          confirmationMode: p.confirmationMode,
          paymentMode: p.paymentMode,
          captureMode: p.captureMode,
          cancellationPolicy: { freeCancelHours: p.freeCancelHours, lateCancelRefundPercent: p.lateCancelRefundPercent },
          physicianSharePercent: p.physicianSharePercent ? Number(p.physicianSharePercent) : null,
          insuranceNote: p.insuranceNote || null,
          updatedAt: new Date(),
        })
        .where(eq(facilities.id, p.id));
      await audit(db(), actor, "facility.update", "facility", p.id);
    } else {
      const p = z.object({ id: z.uuid(), radiusKm: z.coerce.number().positive().max(80), surcharge: z.coerce.number().nonnegative(), travelBufferMinutes: z.coerce.number().int().min(0), active: z.string().optional() }).parse(Object.fromEntries(form));
      await db().update(homeVisitZones).set({ radiusKm: p.radiusKm, surchargeMinor: Math.round(p.surcharge * 100), travelBufferMinutes: p.travelBufferMinutes, active: p.active === "on" }).where(eq(homeVisitZones.id, p.id));
      await audit(db(), actor, "zone.update", "home_visit_zone", p.id);
    }
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin/pricing");
  revalidatePath("/[locale]", "layout");
  return { ok: true };
}

/** Facility verification is a compliance act: tech/compliance admin only, with evidence. */
export async function verifyFacilityAction(_: Result, form: FormData): Promise<Result> {
  try {
    const { actor } = await staff("settings:compliance");
    const id = z.uuid().parse(form.get("id"));
    const evidence = z.string().min(5, "Record the evidence (contract/licence reference)").parse(form.get("evidence"));
    const [f] = await db().select().from(facilities).where(eq(facilities.id, id));
    if (!f.legalEntityName || !f.dhaFacilityLicense || !f.addressLine) return { error: "Legal entity, DHA facility licence and address are required first" };
    await db().update(facilities).set({ status: "verified", isDemo: false, updatedAt: new Date() }).where(eq(facilities.id, id));
    await audit(db(), actor, "facility.verify", "facility", id, { evidence });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin/pricing");
  return { ok: true };
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function complianceAction(_: Result, form: FormData): Promise<Result> {
  try {
    const { u, actor } = await staff("settings:compliance");
    const current = await getCompliance(db());
    const str = (k: string) => (String(form.get(k) ?? "").trim() || null);
    const next = complianceSchema.parse({
      ...current,
      serviceProviderEntity: str("serviceProviderEntity"),
      merchantOfRecord: str("merchantOfRecord"),
      stripeAccountOwnerEntity: str("stripeAccountOwnerEntity"),
      recordsCustodian: str("recordsCustodian"),
      dhaAdvertisingPermitRef: str("dhaAdvertisingPermitRef"),
      homeHealthcareAuthorizationRef: str("homeHealthcareAuthorizationRef"),
      facilityContractPermitsExternalBooking: form.get("facilityContractPermitsExternalBooking") === "on",
      insuranceBilling: form.get("insuranceBilling"),
      paymentsMode: form.get("paymentsMode"),
      homeVisitsMode: form.get("homeVisitsMode"),
      emrMode: form.get("emrMode"),
      whatsappMode: form.get("whatsappMode"),
      adPixelsEnabled: false, // not enabled from UI — requires code review + legal sign-off
      conversionApisEnabled: false,
    });
    const reference = str("approvalReference");
    const changed = (["paymentsMode", "homeVisitsMode", "emrMode", "whatsappMode"] as const).filter((k) => next[k] !== current[k]);
    if (changed.length && !reference) return { error: "Record the approval reference (document/email/contract) for this change" };
    if (reference) next.approvals = [...current.approvals, ...changed.map((c) => ({ capability: `${c}=${next[c]}`, reference, approvedBy: u.email ?? u.userId, recordedAt: new Date().toISOString() }))];
    await db()
      .insert(settings)
      .values({ key: "compliance", value: next, updatedBy: u.userId })
      .onConflictDoUpdate({ target: settings.key, set: { value: next, updatedBy: u.userId, updatedAt: new Date(), version: (await db().select().from(settings).where(eq(settings.key, "compliance")))[0]?.version + 1 || 1 } });
    await audit(db(), actor, "compliance.update", "settings", "compliance", { changed });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function userRoleAction(_: Result, form: FormData): Promise<Result> {
  try {
    const { u, actor } = await staff("users:manage");
    const email = z.email().parse(form.get("email")).toLowerCase();
    const roles = z.array(z.enum(["doctor", "practice_admin", "reception", "content_editor", "finance", "tech_admin"])).parse(form.getAll("roles"));
    if (roles.includes("doctor") && !u.roles.includes("doctor") && !u.roles.includes("tech_admin")) return { error: "Only a technical administrator can grant the doctor role" };
    const [existing] = await db().select().from(users).where(eq(users.email, email));
    const finalRoles = roles.length ? roles : (["patient"] as const);
    if (existing) {
      await db().update(users).set({ roles: [...finalRoles], updatedAt: new Date() }).where(eq(users.id, existing.id));
    } else {
      await db().insert(users).values({ email, roles: [...finalRoles] });
    }
    await audit(db(), actor, "user.roles", "user", email, { roles: finalRoles });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function disableUserAction(_: Result, form: FormData): Promise<Result> {
  try {
    const { u, actor } = await staff("users:manage");
    const id = z.uuid().parse(form.get("userId"));
    if (id === u.userId) return { error: "You cannot disable your own account" };
    await db().update(users).set({ disabledAt: new Date(), roles: ["patient"] }).where(and(eq(users.id, id)));
    await audit(db(), actor, "user.disable", "user", id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin/settings");
  return { ok: true };
}
