import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { loginChallenges, sessions, users } from "@/db/schema";
import { hashToken, randomNumericCode, randomToken, safeEqual, verifyTotp, decrypt } from "@/lib/crypto";
import { enqueue } from "@/server/notifications/outbox";
import { normalizeEmail } from "@/server/accounts";
import type { Role } from "@/lib/rbac";
import { isStaff } from "@/lib/rbac";
import { audit } from "@/server/audit";

export const SESSION_COOKIE = "dr_session";
export const PATIENT_SESSION_DAYS = 14;
export const STAFF_SESSION_HOURS = 12;
const CODE_TTL_MIN = 10;
const MAX_CODE_ATTEMPTS = 5;
const MAX_CHALLENGES_PER_HOUR = 5;

export class AuthError extends Error {
  constructor(public code: "rate_limited" | "invalid_code" | "expired" | "disabled" | "mfa_required" | "invalid_mfa") {
    super(code);
  }
}

/**
 * Starts a passwordless sign-in. Always behaves identically whether or not the email is
 * registered (no account enumeration). A code + single-use link is sent to the address.
 */
export async function requestLoginCode(database: Db, rawEmail: string, baseUrl: string, locale = "en") {
  const email = normalizeEmail(rawEmail);
  const [{ recent }] = await database
    .select({ recent: sql<number>`count(*)::int` })
    .from(loginChallenges)
    .where(and(eq(loginChallenges.destination, email), gt(loginChallenges.createdAt, new Date(Date.now() - 3600_000))));
  if (recent >= MAX_CHALLENGES_PER_HOUR) throw new AuthError("rate_limited");

  const code = randomNumericCode(6);
  const link = randomToken(32);
  const [challenge] = await database
    .insert(loginChallenges)
    .values({
      channel: "email",
      destination: email,
      codeHash: hashToken(`${email}:${code}`),
      linkTokenHash: hashToken(link),
      expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000),
    })
    .returning({ id: loginChallenges.id });

  await enqueue(database, {
    dedupeKey: `login_code:${challenge.id}`,
    channel: "email",
    template: "login_code",
    recipientAddress: email,
    params: { code, link: `${baseUrl}/${locale}/login/verify?token=${link}` },
  });
  return { challengeId: challenge.id };
}

async function consumeChallenge(database: Db, where: ReturnType<typeof eq>, check: (c: typeof loginChallenges.$inferSelect) => boolean) {
  // The failed-attempt increment must commit even though the caller gets an error,
  // so the transaction returns an outcome and we throw only after it has committed.
  const outcome = await database.transaction(async (tx) => {
    const [c] = await tx.select().from(loginChallenges).where(and(where, isNull(loginChallenges.consumedAt))).for("update");
    if (!c) return { error: "invalid_code" as const };
    if (c.expiresAt < new Date()) return { error: "expired" as const };
    if (c.attempts >= MAX_CODE_ATTEMPTS) return { error: "rate_limited" as const };
    if (!check(c)) {
      await tx.update(loginChallenges).set({ attempts: c.attempts + 1 }).where(eq(loginChallenges.id, c.id));
      return { error: "invalid_code" as const };
    }
    await tx.update(loginChallenges).set({ consumedAt: new Date() }).where(eq(loginChallenges.id, c.id));
    return { challenge: c };
  });
  if (!outcome.challenge) throw new AuthError(outcome.error ?? "invalid_code");
  return outcome.challenge;
}

export async function verifyLoginCode(database: Db, challengeId: string, rawEmail: string, code: string) {
  const email = normalizeEmail(rawEmail);
  const c = await consumeChallenge(database, eq(loginChallenges.id, challengeId), (row) =>
    row.destination === email && safeEqual(row.codeHash, hashToken(`${email}:${code.trim()}`)),
  );
  return signInVerifiedEmail(database, c.destination);
}

export async function verifyLoginLink(database: Db, token: string) {
  const c = await consumeChallenge(database, eq(loginChallenges.linkTokenHash, hashToken(token)), () => true);
  return signInVerifiedEmail(database, c.destination);
}

/** Email ownership is now proven. Find-or-create the account and mark the email verified. */
async function signInVerifiedEmail(database: Db, email: string) {
  let [user] = await database.select().from(users).where(eq(users.email, email));
  if (!user) {
    [user] = await database.insert(users).values({ email, emailVerifiedAt: new Date(), roles: ["patient"] }).returning();
  } else if (!user.emailVerifiedAt) {
    [user] = await database.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id)).returning();
  }
  if (user.disabledAt) throw new AuthError("disabled");
  return user;
}

export async function createSession(database: Db, userId: string, roles: Role[], meta: { userAgent?: string | null; ip?: string | null }) {
  const token = randomToken(32);
  const staff = isStaff(roles);
  const expiresAt = new Date(Date.now() + (staff ? STAFF_SESSION_HOURS * 3600_000 : PATIENT_SESSION_DAYS * 86400_000));
  await database.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    ipHash: meta.ip ? hashToken(`ip:${meta.ip}`) : null,
    expiresAt,
  });
  await audit(database, { userId, role: roles.join(","), type: staff ? "staff" : "patient" }, "auth.sign_in", "user", userId);
  return { token, expiresAt };
}

export type SessionUser = {
  sessionId: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  roles: Role[];
  emailVerified: boolean;
  mfaVerified: boolean;
  totpEnabled: boolean;
};

export async function resolveSession(database: Db, token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const [row] = await database
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
  if (!row || row.u.disabledAt) return null;
  // Touch at most once a minute.
  if (Date.now() - row.s.lastSeenAt.getTime() > 60_000) {
    await database.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.s.id));
  }
  return {
    sessionId: row.s.id,
    userId: row.u.id,
    email: row.u.email,
    displayName: row.u.displayName,
    roles: row.u.roles as Role[],
    emailVerified: !!row.u.emailVerifiedAt,
    mfaVerified: !!row.s.mfaVerifiedAt,
    totpEnabled: !!row.u.totpEnabledAt,
  };
}

export async function verifyStaffMfa(database: Db, session: SessionUser, code: string) {
  const [u] = await database.select().from(users).where(eq(users.id, session.userId));
  if (!u?.totpSecretEnc || !u.totpEnabledAt) throw new AuthError("mfa_required");
  if (!verifyTotp(decrypt(u.totpSecretEnc), code)) {
    await audit(database, { userId: u.id, role: "staff", type: "staff" }, "auth.mfa_failed", "user", u.id);
    throw new AuthError("invalid_mfa");
  }
  await database.update(sessions).set({ mfaVerifiedAt: new Date() }).where(eq(sessions.id, session.sessionId));
  await audit(database, { userId: u.id, role: "staff", type: "staff" }, "auth.mfa_verified", "user", u.id);
}

export async function revokeSession(database: Db, sessionId: string) {
  await database.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function revokeAllSessions(database: Db, userId: string) {
  await database.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
