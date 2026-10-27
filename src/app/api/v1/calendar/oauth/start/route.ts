import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomToken } from "@/lib/crypto";
import { authUrl } from "@/server/calendar/google";
import { getSessionUser } from "@/server/auth/session";
import { can } from "@/lib/rbac";
import { baseUrl } from "@/server/deps";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.mfaVerified || !can(user.roles, "settings:integrations")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) return NextResponse.json({ error: "GOOGLE_OAUTH_CLIENT_ID not configured" }, { status: 400 });
  const state = randomToken(24);
  (await cookies()).set("dr_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/v1/calendar", maxAge: 600 });
  return NextResponse.redirect(authUrl(`${baseUrl()}/api/v1/calendar/oauth/callback`, state));
}
