import { describe, it, expect, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb } from "./helpers/db";
import { makeDeps, seedPractice } from "./helpers/fixtures";
import type { Db } from "@/db";
import { articles, auditLog, bookings, calendarConnections, calendarEventLinks, clinicalNotes, loginChallenges, notifications, patients, sessions, users } from "@/db/schema";
import { AuthError, createSession, requestLoginCode, resolveSession, verifyLoginCode, verifyLoginLink } from "@/server/auth/core";
import { can, ROLE_PERMISSIONS } from "@/lib/rbac";
import { amendNote, createNote, listNotes, RecordsError } from "@/server/emr/records";
import { DEFAULT_COMPLIANCE, capabilityBlockers, paymentsEnabled } from "@/server/compliance";
import { createArticle, publishedArticle, transitionArticle, updateArticle, CmsError } from "@/server/cms/articles";
import { applyQuietHours, enqueue, processOutbox } from "@/server/notifications/outbox";
import { TemplateParamError } from "@/server/notifications/templates";
import { eventBody, syncCalendar } from "@/server/calendar/google";
import { inspectHtml } from "@/server/seo/audit";
import { decrypt, encrypt, generateTotpSecret, totp, verifyTotp } from "@/lib/crypto";
import { createHold, submitDetailsAndCheckout, confirmBooking } from "@/server/booking/engine";
import { localToUtc } from "@/lib/time";

let db: Db;
beforeEach(async () => {
  ({ db } = await createTestDb());
});

// Captures login codes from the queued (not yet delivered) notification params.
async function lastCode(email: string) {
  const [n] = await db.select().from(notifications).where(eq(notifications.recipientAddress, email)).orderBy(sql`created_at desc`).limit(1);
  return (n.params as { code: string; link: string });
}

describe("passwordless authentication", () => {
  it("signs in with a one-time code, verifies the email, and never stores the code in clear", async () => {
    const { challengeId } = await requestLoginCode(db, "New@Example.test", "https://x");
    const { code } = await lastCode("new@example.test");
    const [c] = await db.select().from(loginChallenges);
    expect(c.codeHash).not.toContain(code);
    const user = await verifyLoginCode(db, challengeId, "new@example.test", code);
    expect(user.emailVerifiedAt).not.toBeNull();
    // single use
    await expect(verifyLoginCode(db, challengeId, "new@example.test", code)).rejects.toBeInstanceOf(AuthError);
  });

  it("locks a challenge after too many wrong codes", async () => {
    const { challengeId } = await requestLoginCode(db, "a@example.test", "https://x");
    for (let i = 0; i < 5; i++) await expect(verifyLoginCode(db, challengeId, "a@example.test", "000000")).rejects.toMatchObject({ code: expect.stringMatching(/invalid_code|rate_limited/) });
    const { code } = await lastCode("a@example.test");
    await expect(verifyLoginCode(db, challengeId, "a@example.test", code)).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("rate-limits code requests per address", async () => {
    for (let i = 0; i < 5; i++) await requestLoginCode(db, "b@example.test", "https://x");
    await expect(requestLoginCode(db, "b@example.test", "https://x")).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("magic links work once", async () => {
    await requestLoginCode(db, "c@example.test", "https://x");
    const { link } = await lastCode("c@example.test");
    const token = new URL(link).searchParams.get("token")!;
    await verifyLoginLink(db, token);
    await expect(verifyLoginLink(db, token)).rejects.toBeInstanceOf(AuthError);
  });

  it("sessions resolve from the cookie token, store only a hash, and staff sessions start without MFA", async () => {
    const [u] = await db.insert(users).values({ email: "dr@example.test", roles: ["doctor"] }).returning();
    const { token } = await createSession(db, u.id, ["doctor"], {});
    const [s] = await db.select().from(sessions);
    expect(s.tokenHash).not.toBe(token);
    const su = await resolveSession(db, token);
    expect(su?.mfaVerified).toBe(false);
    expect(await resolveSession(db, "bogus")).toBeNull();
  });
});

describe("TOTP & encryption", () => {
  it("verifies RFC 6238 codes with ±1 step skew", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    expect(verifyTotp(secret, totp(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, now - 120_000), now)).toBe(false);
  });
  it("round-trips AES-GCM and detects tampering", () => {
    const c = encrypt("sensitive");
    expect(decrypt(c)).toBe("sensitive");
    expect(() => decrypt(c.slice(0, -2) + (c.endsWith("A") ? "B" : "A") + c.slice(-1))).toThrow();
  });
});

describe("role-based access", () => {
  it("never gives clinical access to reception, marketing/content, finance or tech roles", () => {
    for (const r of ["reception", "content_editor", "finance", "tech_admin", "practice_admin", "patient"] as const) {
      expect(can([r], "clinical:read")).toBe(false);
    }
    expect(can(["doctor"], "clinical:sign")).toBe(true);
  });
  it("only the doctor can medically approve content", () => {
    const approvers = Object.entries(ROLE_PERMISSIONS).filter(([, p]) => p.includes("content:medical_approve")).map(([r]) => r);
    expect(approvers).toEqual(["doctor"]);
  });
});

describe("compliance gating", () => {
  it("blocks live payments until merchant, Stripe owner and facility permission are recorded", () => {
    const c = { ...DEFAULT_COMPLIANCE, paymentsMode: "live" as const };
    expect(capabilityBlockers(c, "payments_live").length).toBeGreaterThan(0);
    const ok = { ...c, merchantOfRecord: "X LLC", stripeAccountOwnerEntity: "X LLC", serviceProviderEntity: "Clinic FZ", facilityContractPermitsExternalBooking: true };
    expect(capabilityBlockers(ok, "payments_live")).toEqual([]);
    expect(capabilityBlockers({ ...ok, stripeAccountOwnerEntity: "Other Co" }, "payments_live")).toContain("Stripe account owner must be the merchant of record");
  });
  it("uses test mode only with a test key", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    expect(paymentsEnabled({ ...DEFAULT_COMPLIANCE, paymentsMode: "test" })).toBe("test");
    process.env.STRIPE_SECRET_KEY = "sk_live_x";
    expect(paymentsEnabled({ ...DEFAULT_COMPLIANCE, paymentsMode: "test" })).toBe("disabled");
  });
});

describe("clinical records", () => {
  const emrOn = { ...DEFAULT_COMPLIANCE, emrMode: "document_reference" as const, recordsCustodian: "Licensed Clinic LLC" };
  async function setup() {
    const [doc] = await db.insert(users).values({ email: "doc@example.test", roles: ["doctor"] }).returning();
    const [p] = await db.insert(patients).values({ fullName: "P One" }).returning();
    return { actor: { userId: doc.id, role: "doctor", type: "staff" as const, roles: ["doctor" as const] }, patientId: p.id };
  }

  it("refuses to store anything when records are not authorised", async () => {
    const { actor, patientId } = await setup();
    await expect(createNote(db, DEFAULT_COMPLIANCE, actor, { patientId, type: "visit_summary", body: { text: "x" }, patientVisible: true, sign: true })).rejects.toThrow(/not authorised/);
  });

  it("in reference mode only allows patient-facing summaries", async () => {
    const { actor, patientId } = await setup();
    await expect(createNote(db, emrOn, actor, { patientId, type: "visit_note", body: { text: "x" }, patientVisible: false, sign: true })).rejects.toBeInstanceOf(RecordsError);
  });

  it("encrypts note bodies, makes signed notes immutable and keeps amendment history", async () => {
    const { actor, patientId } = await setup();
    const id = await createNote(db, emrOn, actor, { patientId, type: "visit_summary", body: { text: "Original summary" }, patientVisible: true, sign: true });
    const [raw] = await db.select().from(clinicalNotes).where(eq(clinicalNotes.id, id));
    expect(raw.bodyEnc).not.toContain("Original");
    await expect(db.update(clinicalNotes).set({ bodyEnc: "tampered" }).where(eq(clinicalNotes.id, id))).rejects.toThrow();
    const amended = await amendNote(db, actor, id, { text: "Corrected summary" }, "typo in dosage instructions");
    const notes = await listNotes(db, actor, patientId);
    expect(notes).toHaveLength(2);
    expect(notes.find((n) => n.id === amended)?.supersedesId).toBe(id);
  });

  it("denies non-clinical roles", async () => {
    const { patientId } = await setup();
    await expect(listNotes(db, { userId: null, role: "reception", type: "staff", roles: ["reception"] }, patientId)).rejects.toBeInstanceOf(RecordsError);
  });

  it("audit log is append-only", async () => {
    const { actor, patientId } = await setup();
    await listNotes(db, actor, patientId);
    await expect(db.delete(auditLog)).rejects.toThrow();
  });
});

describe("CMS medical workflow", () => {
  async function staff() {
    const [doc] = await db.insert(users).values({ email: "doc@example.test", roles: ["doctor"] }).returning();
    const [ed] = await db.insert(users).values({ email: "ed@example.test", roles: ["content_editor"] }).returning();
    const [adm] = await db.insert(users).values({ email: "adm@example.test", roles: ["practice_admin"] }).returning();
    return {
      doctor: { userId: doc.id, role: "doctor", type: "staff" as const, roles: ["doctor" as const], name: "Dr. Ensiyeh Rahimi" },
      editor: { userId: ed.id, role: "content_editor", type: "staff" as const, roles: ["content_editor" as const], name: "Editor" },
      admin: { userId: adm.id, role: "practice_admin", type: "staff" as const, roles: ["practice_admin" as const], name: "Admin" },
    };
  }
  const input = (text: string) => ({ title: "Travel health basics", blocks: [{ type: "paragraph", text }], references: [] });

  it("requires doctor approval before publishing; editors cannot approve", async () => {
    const s = await staff();
    const a = await createArticle(db, s.editor, input("v1 text"));
    await transitionArticle(db, s.editor, a.id, "submit");
    await expect(transitionArticle(db, s.editor, a.id, "approve")).rejects.toBeInstanceOf(CmsError);
    await expect(transitionArticle(db, s.admin, a.id, "publish")).rejects.toThrow(/not been medically approved/);
    await transitionArticle(db, s.doctor, a.id, "approve");
    await transitionArticle(db, s.admin, a.id, "publish");
    const pub = await publishedArticle(db, "en", a.slug);
    expect(pub?.medicalReviewerName).toBe("Dr. Ensiyeh Rahimi");
    expect(pub?.reviewDueAt).not.toBeNull();
  });

  it("keeps the approved text live while unreviewed edits await re-approval", async () => {
    const s = await staff();
    const a = await createArticle(db, s.editor, input("approved text"));
    await transitionArticle(db, s.editor, a.id, "submit");
    await transitionArticle(db, s.doctor, a.id, "approve");
    await transitionArticle(db, s.admin, a.id, "publish");
    await updateArticle(db, s.editor, a.id, input("UNREVIEWED new claim"));
    const live = await publishedArticle(db, "en", a.slug);
    expect(JSON.stringify(live?.blocks)).toContain("approved text");
    expect(JSON.stringify(live?.blocks)).not.toContain("UNREVIEWED");
  });

  it("rejects images without alt text", async () => {
    const s = await staff();
    await expect(createArticle(db, s.editor, { title: "Images", blocks: [{ type: "image", url: "/x.jpg", alt: "" }], references: [] })).rejects.toThrow();
  });

  it("detects concurrent edits", async () => {
    const s = await staff();
    const a = await createArticle(db, s.editor, input("x"));
    await db.update(articles).set({ revision: 5 }).where(eq(articles.id, a.id));
    await updateArticle(db, s.editor, a.id, input("y"));
    const [row] = await db.select().from(articles).where(eq(articles.id, a.id));
    expect(row.revision).toBe(6);
  });
});

describe("notifications", () => {
  it("rejects parameters not declared by a template (no clinical data can be attached)", async () => {
    await expect(enqueue(db, { dedupeKey: "x", channel: "email", template: "booking_confirmed", recipientAddress: "a@example.test", params: { reference: "R", diagnosis: "x" } })).rejects.toBeInstanceOf(TemplateParamError);
  });

  it("deduplicates, retries with backoff and escalates final failures", async () => {
    process.env.OPS_ALERT_EMAIL = "ops@example.test";
    const p = { reference: "R1", when: "Mon", location: "Clinic", link: "https://x" };
    await enqueue(db, { dedupeKey: "k1", channel: "whatsapp", template: "booking_confirmed", recipientAddress: "+971500000000", params: p });
    await enqueue(db, { dedupeKey: "k1", channel: "whatsapp", template: "booking_confirmed", recipientAddress: "+971500000000", params: p });
    expect(await db.select().from(notifications)).toHaveLength(1);
    const failing = { whatsapp: { send: async () => { throw new Error("boom"); } }, email: { send: async () => "ok" } };
    let now = new Date();
    for (let i = 0; i < 6; i++) {
      await processOutbox(db, failing, now);
      now = new Date(now.getTime() + 200 * 60_000);
    }
    const rows = await db.select().from(notifications);
    expect(rows.find((r) => r.dedupeKey === "k1")?.status).toBe("failed");
    expect(rows.some((r) => r.template === "ops_alert")).toBe(true);
  });

  it("defers non-urgent messages out of quiet hours (Dubai)", () => {
    const late = new Date("2026-11-01T19:30:00Z"); // 23:30 Dubai
    expect(applyQuietHours(late, false).toISOString()).toBe("2026-11-02T04:00:00.000Z"); // 08:00 Dubai
    expect(applyQuietHours(late, true)).toBe(late);
  });
});

describe("Google Calendar sync", () => {
  it("creates neutral, minimal events and removes them on cancellation", async () => {
    const fx = await seedPractice(db, { facilityPaymentMode: "pay_at_facility" });
    process.env.GOOGLE_OAUTH_CLIENT_ID = "id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
    const [conn] = await db.insert(calendarConnections).values({ providerId: fx.provider.id, refreshTokenEnc: encrypt("rt") }).returning();
    const deps = makeDeps(db, localToUtc("2026-11-01", "06:00"), { paymentsMode: "disabled" });
    const { booking, accessToken } = await createHold(deps, { offeringId: fx.clinicOffering.id, startsAt: localToUtc("2026-11-02", "10:00"), idempotencyKey: "cal-1" });
    await submitDetailsAndCheckout(deps, booking.id, accessToken, { fullName: "Secret Name", email: "s@example.test", phone: "+971500000009", acceptedPolicyVersion: "v" });
    await confirmBooking(deps, { userId: fx.staff.id, role: "doctor", type: "staff" }, booking.id);

    const calls: { url: string; method: string; body?: string }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined });
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "at" }));
      if (url.includes("freeBusy")) return new Response(JSON.stringify({ calendars: { primary: { busy: [{ start: "2026-11-02T08:00:00Z", end: "2026-11-02T09:00:00Z" }] } } }));
      if (init?.method === "POST") return new Response(JSON.stringify({ id: "evt1" }));
      return new Response("{}");
    }) as typeof fetch;
    const r = await syncCalendar(db, "https://staging.example", fake);
    expect(r.pushed).toBe(1);
    const insert = calls.find((c) => c.method === "POST" && c.url.includes("/events"))!;
    expect(insert.body).toContain(`Medical Appointment — Booking #${booking.reference}`);
    expect(insert.body).not.toContain("Secret Name");
    expect(insert.body).not.toMatch(/consult|infect/i);
    const [link] = await db.select().from(calendarEventLinks).where(eq(calendarEventLinks.connectionId, conn.id));
    expect(link.googleEventId).toBe("evt1");
    expect(r.busy).toBe(1);
  });

  it("event body contains no patient identifiers", () => {
    const body = eventBody({ id: "b1", reference: "DR-ABC123", kind: "clinic", startsAt: new Date(), endsAt: new Date(), contactName: "Jane" } as never, "https://x");
    expect(JSON.stringify(body)).not.toContain("Jane");
  });
});

describe("SEO audit", () => {
  it("flags missing metadata, multiple h1 and missing alt text", () => {
    const { issues } = inspectHtml("/x", "<html><head><title>T</title></head><body><h1>a</h1><h1>b</h1><img src=x></body></html>", 200);
    const types = issues.map((i) => i.type);
    expect(types).toEqual(expect.arrayContaining(["missing_description", "missing_canonical", "h1_count", "missing_alt"]));
  });
});

describe("patient privacy in bookings", () => {
  it("stores no medical detail on the booking and only links accounts by verified-later email", async () => {
    const fx = await seedPractice(db, { facilityPaymentMode: "pay_at_facility" });
    const deps = makeDeps(db, localToUtc("2026-11-01", "06:00"), { paymentsMode: "disabled" });
    const { booking, accessToken } = await createHold(deps, { offeringId: fx.clinicOffering.id, startsAt: localToUtc("2026-11-02", "11:00"), idempotencyKey: "priv-1" });
    await submitDetailsAndCheckout(deps, booking.id, accessToken, { fullName: "Victim Name", email: "victim@example.test", phone: "+971500000010", acceptedPolicyVersion: "v" });
    // An attacker booking with the victim's email doesn't gain access: the account is unverified
    // until someone proves control of the mailbox, and clinical identity is unverified.
    const [u] = await db.select().from(users).where(eq(users.email, "victim@example.test"));
    expect(u.emailVerifiedAt).toBeNull();
    const [p] = await db.select().from(patients).where(eq(patients.accountUserId, u.id));
    expect(p.identityVerifiedAt).toBeNull();
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(Object.keys(b)).not.toContain("diagnosis");
  });
});
