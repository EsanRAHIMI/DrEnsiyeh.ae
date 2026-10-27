import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { attributions, funnelEvents } from "@/db/schema";
import { hasAnalyticsConsent } from "@/server/analytics/funnel";
import { limitOr429 } from "@/server/http";

const B = z.object({
  step: z.enum(["page_view", "booking_start"]),
  path: z.string().max(200),
  utm: z.record(z.string(), z.string().max(100)).optional(),
  clickPlatform: z.string().max(20).nullable().optional(),
});

const PRIVATE = /\/(portal|admin|login|book\/status)/;

/** First-party, consent-gated measurement endpoint. Rejects anything from private areas. */
export async function POST(req: Request) {
  const limited = limitOr429(req, "track", 120, 60_000);
  if (limited) return limited;
  if (!(await hasAnalyticsConsent())) return new NextResponse(null, { status: 204 });
  const parsed = B.safeParse(await req.json().catch(() => null));
  if (!parsed.success || PRIVATE.test(parsed.data.path)) return new NextResponse(null, { status: 204 });
  const { step, path, utm, clickPlatform } = parsed.data;
  const jar = await cookies();
  let anon = jar.get("dr_anon")?.value;
  const res = new NextResponse(null, { status: 204 });
  const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90 };
  if (!anon) {
    anon = randomUUID();
    res.cookies.set("dr_anon", anon, cookieOpts);
  }
  let attributionId = jar.get("dr_attr")?.value ?? null;
  if (utm && Object.keys(utm).length > 0) {
    const [a] = await db()
      .insert(attributions)
      .values({
        anonymousId: anon,
        source: utm.utm_source ?? null,
        medium: utm.utm_medium ?? null,
        campaign: utm.utm_campaign ?? null,
        content: utm.utm_content ?? null,
        term: utm.utm_term ?? null,
        clickPlatform: clickPlatform ?? null,
        landingPath: path,
        experimentVariant: path.includes("/lp/") ? (jar.get("dr_exp")?.value ?? null) : null,
      })
      .returning({ id: attributions.id });
    attributionId = a.id;
    res.cookies.set("dr_attr", a.id, { ...cookieOpts, maxAge: 60 * 60 * 24 * 30 });
  }
  await db().insert(funnelEvents).values({ step, path, anonymousId: anon, attributionId });
  return res;
}
