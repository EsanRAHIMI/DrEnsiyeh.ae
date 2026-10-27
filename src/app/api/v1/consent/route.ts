import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { consents } from "@/db/schema";
import { getSessionUser } from "@/server/auth/session";
import { limitOr429 } from "@/server/http";
import { cookies } from "next/headers";

const B = z.object({ version: z.string().max(20), analytics: z.boolean(), ads: z.boolean() });

/** Auditable consent history (versioned). */
export async function POST(req: Request) {
  const limited = limitOr429(req, "consent", 30, 60_000);
  if (limited) return limited;
  const parsed = B.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 422 });
  const user = await getSessionUser().catch(() => null);
  const anon = (await cookies()).get("dr_anon")?.value ?? null;
  await db().insert(consents).values([
    { userId: user?.userId ?? null, anonymousId: anon, purpose: "analytics", granted: parsed.data.analytics, documentVersion: parsed.data.version, source: "cookie_banner" },
    { userId: user?.userId ?? null, anonymousId: anon, purpose: "marketing_ads", granted: parsed.data.ads, documentVersion: parsed.data.version, source: "cookie_banner" },
  ]);
  return new NextResponse(null, { status: 204 });
}
