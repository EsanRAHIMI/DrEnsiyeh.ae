import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { bookings, clinicalNotes, documents, patients } from "@/db/schema";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { audit, type Actor } from "@/server/audit";
import { type Compliance, requireCapability } from "@/server/compliance";
import { can, type Role } from "@/lib/rbac";

export class RecordsError extends Error {}

type NoteType = (typeof clinicalNotes.$inferInsert)["type"];
export type NoteBody = { title?: string; text: string; coded?: { system: string; code: string; display?: string }[] };

function assertClinical(roles: Role[], perm: "clinical:read" | "clinical:write" | "clinical:sign") {
  if (!can(roles, perm)) throw new RecordsError("forbidden");
}

/**
 * Structured notes. In "document_reference" mode only patient-facing summaries and follow-up
 * instructions may be authored here; full clinical documentation stays in the facility EMR.
 */
export async function createNote(
  database: Db,
  compliance: Compliance,
  actor: Actor & { roles: Role[] },
  input: { patientId: string; bookingId?: string | null; type: NoteType; body: NoteBody; patientVisible: boolean; sign: boolean },
) {
  assertClinical(actor.roles, "clinical:write");
  requireCapability(compliance, "emr_reference");
  if (compliance.emrMode === "document_reference" && !["visit_summary", "follow_up"].includes(input.type)) {
    throw new RecordsError("Only visit summaries and follow-up instructions can be stored here; full notes belong in the facility EMR.");
  }
  if (input.sign) assertClinical(actor.roles, "clinical:sign");
  const [n] = await database
    .insert(clinicalNotes)
    .values({
      patientId: input.patientId,
      bookingId: input.bookingId ?? null,
      type: input.type,
      bodyEnc: encryptJson(input.body),
      authorUserId: actor.userId!,
      patientVisible: input.patientVisible,
      signedAt: input.sign ? new Date() : null,
    })
    .returning({ id: clinicalNotes.id });
  await audit(database, actor, "clinical_note.create", "clinical_note", n.id, { patientId: input.patientId, type: input.type, signed: input.sign });
  return n.id;
}

export async function signNote(database: Db, actor: Actor & { roles: Role[] }, noteId: string) {
  assertClinical(actor.roles, "clinical:sign");
  const [n] = await database.select().from(clinicalNotes).where(eq(clinicalNotes.id, noteId));
  if (!n) throw new RecordsError("not found");
  if (n.signedAt) return;
  if (n.authorUserId !== actor.userId) throw new RecordsError("Only the author can sign a note");
  await database.update(clinicalNotes).set({ signedAt: new Date() }).where(eq(clinicalNotes.id, noteId));
  await audit(database, actor, "clinical_note.sign", "clinical_note", noteId);
}

/** Signed notes are immutable (DB trigger). Amendments create a new signed version with a reason. */
export async function amendNote(database: Db, actor: Actor & { roles: Role[] }, noteId: string, body: NoteBody, reason: string) {
  assertClinical(actor.roles, "clinical:sign");
  if (reason.trim().length < 5) throw new RecordsError("An amendment reason is required");
  const [n] = await database.select().from(clinicalNotes).where(eq(clinicalNotes.id, noteId));
  if (!n?.signedAt) throw new RecordsError("Only signed notes can be amended; edit drafts directly");
  const [a] = await database
    .insert(clinicalNotes)
    .values({
      patientId: n.patientId,
      bookingId: n.bookingId,
      type: n.type,
      bodyEnc: encryptJson(body),
      authorUserId: actor.userId!,
      patientVisible: n.patientVisible,
      signedAt: new Date(),
      supersedesId: n.id,
      amendmentReason: reason.trim(),
    })
    .returning({ id: clinicalNotes.id });
  await audit(database, actor, "clinical_note.amend", "clinical_note", a.id, { supersedes: n.id });
  return a.id;
}

export async function listNotes(database: Db, actor: Actor & { roles: Role[] }, patientId: string) {
  assertClinical(actor.roles, "clinical:read");
  const rows = await database.select().from(clinicalNotes).where(eq(clinicalNotes.patientId, patientId)).orderBy(desc(clinicalNotes.createdAt));
  await audit(database, actor, "clinical_note.list", "patient", patientId);
  return rows.map((r) => ({ ...r, body: decryptJson<NoteBody>(r.bodyEnc) }));
}

export async function verifyPatientIdentity(database: Db, actor: Actor & { roles: Role[] }, patientId: string, method: string) {
  if (!can(actor.roles, "appointments:manage")) throw new RecordsError("forbidden");
  await database.update(patients).set({ identityVerifiedAt: new Date(), identityVerifiedBy: actor.userId, updatedAt: new Date() }).where(eq(patients.id, patientId));
  await audit(database, actor, "patient.identity_verified", "patient", patientId, { method });
}

export async function verifyGuardian(database: Db, actor: Actor & { roles: Role[] }, patientId: string, evidence: string) {
  if (!can(actor.roles, "appointments:override")) throw new RecordsError("forbidden");
  await database.update(patients).set({ guardianVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(patients.id, patientId));
  await audit(database, actor, "patient.guardian_verified", "patient", patientId, { evidence });
}

/** HL7 FHIR R4 export (Patient + Encounter + DocumentReference + Composition summaries). */
export async function fhirBundle(database: Db, actor: Actor & { roles: Role[] }, patientId: string) {
  assertClinical(actor.roles, "clinical:read");
  const [p] = await database.select().from(patients).where(eq(patients.id, patientId));
  if (!p) throw new RecordsError("not found");
  const encs = await database.select().from(bookings).where(and(eq(bookings.patientId, patientId), eq(bookings.status, "completed")));
  const notes = await listNotes(database, actor, patientId);
  const docs = await database.select().from(documents).where(eq(documents.patientId, patientId));
  await audit(database, actor, "patient.fhir_export", "patient", patientId);
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    entry: [
      {
        resource: {
          resourceType: "Patient",
          id: p.id,
          name: [{ text: p.fullName }],
          birthDate: p.dateOfBirth ?? undefined,
          telecom: [p.email && { system: "email", value: p.email }, p.phone && { system: "phone", value: p.phone }].filter(Boolean),
          identifier: p.externalMrn ? [{ type: { text: "Facility MRN" }, value: p.externalMrn }] : [],
        },
      },
      ...encs.map((b) => ({
        resource: {
          resourceType: "Encounter",
          id: b.id,
          status: "finished",
          class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: b.kind === "home_visit" ? "HH" : "AMB" },
          subject: { reference: `Patient/${p.id}` },
          period: { start: b.startsAt.toISOString(), end: b.endsAt.toISOString() },
          identifier: [{ value: b.reference }],
        },
      })),
      ...notes
        .filter((n) => n.signedAt)
        .map((n) => ({
          resource: {
            resourceType: "Composition",
            id: n.id,
            status: n.supersedesId ? "amended" : "final",
            type: { text: n.type },
            subject: { reference: `Patient/${p.id}` },
            encounter: n.bookingId ? { reference: `Encounter/${n.bookingId}` } : undefined,
            date: n.signedAt!.toISOString(),
            author: [{ reference: `Practitioner/${n.authorUserId}` }],
            title: n.body.title ?? n.type,
            section: [{ text: { status: "generated", div: `<div xmlns="http://www.w3.org/1999/xhtml">${escapeHtml(n.body.text)}</div>` } }],
            relatesTo: n.supersedesId ? [{ code: "replaces", targetReference: { reference: `Composition/${n.supersedesId}` } }] : undefined,
          },
        })),
      ...docs.map((d) => ({
        resource: {
          resourceType: "DocumentReference",
          id: d.id,
          status: "current",
          type: { text: d.category },
          subject: { reference: `Patient/${p.id}` },
          date: d.createdAt.toISOString(),
          description: d.title,
          content: [{ attachment: { contentType: d.contentType ?? undefined, title: d.title, url: d.externalReference ?? undefined, hash: d.sha256 ?? undefined } }],
        },
      })),
    ],
  };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
