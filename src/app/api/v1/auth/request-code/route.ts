import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requestLoginCode } from "@/server/auth/core";
import { handle, limitOr429 } from "@/server/http";
import { baseUrl } from "@/server/deps";

const B = z.object({ email: z.email().max(200), locale: z.enum(["en", "ar"]).default("en") });

/** Per-IP limit on code requests. Test environments (many sign-ins from one IP) may raise it; production cannot. */
const perIpLimit = () => (process.env.DEPLOY_ENV !== "production" && process.env.AUTH_REQUEST_LIMIT ? Number(process.env.AUTH_REQUEST_LIMIT) : 8);

export const POST = handle(async (req: Request) => {
  const limited = limitOr429(req, "auth-request", perIpLimit(), 15 * 60_000);
  if (limited) return limited;
  const { email, locale } = B.parse(await req.json());
  const { challengeId } = await requestLoginCode(db(), email, baseUrl(), locale);
  return NextResponse.json({ challengeId });
});
