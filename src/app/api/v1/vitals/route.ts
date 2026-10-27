import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { webVitals } from "@/db/schema";
import { limitOr429 } from "@/server/http";

const B = z.object({ name: z.enum(["LCP", "INP", "CLS", "FCP", "TTFB"]), value: z.number().nonnegative(), rating: z.string().max(20).optional(), path: z.string().max(200) });

/** Real-user Core Web Vitals (no identifiers). */
export async function POST(req: Request) {
  const limited = limitOr429(req, "vitals", 60, 60_000);
  if (limited) return limited;
  const p = B.safeParse(await req.json().catch(() => null));
  if (!p.success || /\/(portal|admin)/.test(p.data.path)) return new NextResponse(null, { status: 204 });
  await db().insert(webVitals).values({ ...p.data, rating: p.data.rating ?? null });
  return new NextResponse(null, { status: 204 });
}
