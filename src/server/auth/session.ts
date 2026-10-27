import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { can, isStaff, type Permission } from "@/lib/rbac";
import { resolveSession, SESSION_COOKIE, type SessionUser } from "./core";
import type { Actor } from "@/server/audit";

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveSession(db(), token);
});

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function requestMeta() {
  const h = await headers();
  return { userAgent: h.get("user-agent"), ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") };
}

/** Patient portal guard. */
export async function requirePatient(locale = "en"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login?next=/${locale}/portal`);
  return user;
}

/** Staff guard: staff role + completed TOTP step-up + permission. */
export async function requireStaff(permission?: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/en/login?next=/admin");
  if (!isStaff(user.roles)) redirect("/en/portal");
  if (!user.totpEnabled) redirect("/admin/mfa/setup");
  if (!user.mfaVerified) redirect("/admin/mfa");
  if (permission && !can(user.roles, permission)) redirect("/admin?denied=1");
  return user;
}

export function actorOf(user: SessionUser): Actor {
  return { userId: user.userId, role: user.roles.join(","), type: isStaff(user.roles) ? "staff" : "patient" };
}
