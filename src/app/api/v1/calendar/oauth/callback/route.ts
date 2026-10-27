import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { providers } from "@/db/schema";
import { exchangeCode, saveConnection } from "@/server/calendar/google";
import { getSessionUser } from "@/server/auth/session";
import { can } from "@/lib/rbac";
import { baseUrl } from "@/server/deps";
import { safeEqual } from "@/lib/crypto";
import { audit } from "@/server/audit";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user?.mfaVerified || !can(user.roles, "settings:integrations")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("dr_oauth_state")?.value ?? "";
  jar.delete("dr_oauth_state");
  if (!safeEqual(expected, url.searchParams.get("state") ?? "")) return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${baseUrl()}/admin/settings?calendar=denied`);
  const { refreshToken, email } = await exchangeCode(code, `${baseUrl()}/api/v1/calendar/oauth/callback`);
  const [provider] = await db().select().from(providers).limit(1);
  await saveConnection(db(), provider.id, refreshToken, email);
  await audit(db(), { userId: user.userId, role: user.roles.join(","), type: "staff" }, "calendar.connect", "provider", provider.id);
  return NextResponse.redirect(`${baseUrl()}/admin/settings?calendar=connected`);
}
