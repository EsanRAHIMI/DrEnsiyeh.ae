import { NextResponse } from "next/server";
import { db } from "@/db";
import { AuthError, createSession, verifyLoginLink } from "@/server/auth/core";
import { requestMeta, setSessionCookie } from "@/server/auth/session";
import { isStaff, type Role } from "@/lib/rbac";
import { limitOr429 } from "@/server/http";

/** Magic-link sign-in. Single-use token; the token itself is never logged. */
export async function GET(req: Request, ctx: RouteContext<"/[locale]/login/verify">) {
  const { locale } = await ctx.params;
  const limited = limitOr429(req, "auth-link", 20, 15 * 60_000);
  if (limited) return limited;
  const token = new URL(req.url).searchParams.get("token");
  const base = new URL(req.url).origin;
  if (!token) return NextResponse.redirect(`${base}/${locale}/login?error=invalid`);
  try {
    const user = await verifyLoginLink(db(), token);
    const s = await createSession(db(), user.id, user.roles as Role[], await requestMeta());
    await setSessionCookie(s.token, s.expiresAt);
    return NextResponse.redirect(isStaff(user.roles as Role[]) ? `${base}/admin` : `${base}/${locale}/portal`);
  } catch (err) {
    const code = err instanceof AuthError ? err.code : "invalid";
    return NextResponse.redirect(`${base}/${locale}/login?error=${code}`);
  }
}
