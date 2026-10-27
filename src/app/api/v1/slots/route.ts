import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { availableSlots, checkHomeEligibility } from "@/server/booking/engine";
import { handle, limitOr429 } from "@/server/http";
import { utcToLocalDate } from "@/lib/time";

const Q = z.object({
  offeringId: z.uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.coerce.number().int().min(1).max(14).default(7),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export const GET = handle(async (req: Request) => {
  const limited = limitOr429(req, "slots", 120, 60_000);
  if (limited) return limited;
  const q = Q.parse(Object.fromEntries(new URL(req.url).searchParams));
  let travel = 0;
  if (q.lat !== undefined && q.lng !== undefined) {
    const e = await checkHomeEligibility(db(), q.lat, q.lng);
    if (!e.eligible) return NextResponse.json({ error: "outside_service_area" }, { status: 422 });
    travel = e.travelBufferMinutes;
  }
  const slots = await availableSlots(db(), { offeringId: q.offeringId, fromDate: q.from, days: q.days, travelBufferMinutes: travel, now: new Date() });
  const byDay: Record<string, string[]> = {};
  for (const s of slots) (byDay[utcToLocalDate(s.start)] ??= []).push(s.start.toISOString());
  return NextResponse.json({ days: byDay }, { headers: { "Cache-Control": "no-store" } });
});
