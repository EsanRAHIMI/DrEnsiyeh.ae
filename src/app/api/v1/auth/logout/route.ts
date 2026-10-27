import { NextResponse } from "next/server";
import { db } from "@/db";
import { revokeSession } from "@/server/auth/core";
import { clearSessionCookie, getSessionUser } from "@/server/auth/session";

export async function POST() {
  const user = await getSessionUser();
  if (user) await revokeSession(db(), user.sessionId);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
