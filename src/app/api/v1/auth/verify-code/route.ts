import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { createSession, verifyLoginCode } from "@/server/auth/core";
import { handle, limitOr429 } from "@/server/http";
import { requestMeta, setSessionCookie } from "@/server/auth/session";
import { isStaff, type Role } from "@/lib/rbac";

const B = z.object({ challengeId: z.uuid(), email: z.email(), code: z.string().regex(/^\d{6}$/) });

export const POST = handle(async (req: Request) => {
  const limited = limitOr429(req, "auth-verify", 20, 15 * 60_000);
  if (limited) return limited;
  const { challengeId, email, code } = B.parse(await req.json());
  const user = await verifyLoginCode(db(), challengeId, email, code);
  const { token, expiresAt } = await createSession(db(), user.id, user.roles as Role[], await requestMeta());
  await setSessionCookie(token, expiresAt);
  return NextResponse.json({ ok: true, staff: isStaff(user.roles as Role[]) });
});
