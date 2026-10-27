"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { getSessionUser } from "@/server/auth/session";
import { AuthError, verifyStaffMfa } from "@/server/auth/core";
import { decrypt, encrypt, generateTotpSecret, verifyTotp } from "@/lib/crypto";
import { isStaff } from "@/lib/rbac";
import { audit } from "@/server/audit";

async function staffOrLogin() {
  const u = await getSessionUser();
  if (!u || !isStaff(u.roles)) redirect("/en/login?next=/admin");
  return u;
}

/** Creates (or returns) a pending TOTP secret for enrolment. */
export async function ensurePendingSecret(): Promise<string> {
  const u = await staffOrLogin();
  const [row] = await db().select().from(users).where(eq(users.id, u.userId));
  if (row.totpEnabledAt) redirect("/admin/mfa");
  if (row.totpSecretEnc) return decrypt(row.totpSecretEnc);
  const secret = generateTotpSecret();
  await db().update(users).set({ totpSecretEnc: encrypt(secret) }).where(eq(users.id, u.userId));
  return secret;
}

export async function confirmEnrolment(_: unknown, form: FormData) {
  const u = await staffOrLogin();
  const [row] = await db().select().from(users).where(eq(users.id, u.userId));
  if (!row.totpSecretEnc) return { error: "Start enrolment again." };
  if (!verifyTotp(decrypt(row.totpSecretEnc), String(form.get("code") ?? "").replace(/\s/g, ""))) return { error: "That code didn't match. Check your authenticator app's time is correct." };
  await db().update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, u.userId));
  await db().update(sessions).set({ mfaVerifiedAt: new Date() }).where(eq(sessions.id, u.sessionId));
  await audit(db(), { userId: u.userId, role: u.roles.join(","), type: "staff" }, "auth.mfa_enrolled", "user", u.userId);
  redirect("/admin");
}

export async function stepUp(_: unknown, form: FormData) {
  const u = await staffOrLogin();
  try {
    await verifyStaffMfa(db(), u, String(form.get("code") ?? "").replace(/\s/g, ""));
  } catch (e) {
    return { error: e instanceof AuthError && e.code === "invalid_mfa" ? "Invalid code." : "Verification failed." };
  }
  redirect("/admin");
}
