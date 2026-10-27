import { NextResponse } from "next/server";
import { getBookingForGuest } from "@/server/booking/engine";
import { db } from "@/db";
import { handle } from "@/server/http";

/** Guest status polling after checkout. Returns only non-sensitive status fields. */
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/v1/bookings/[id]">) => {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t");
  const b = await getBookingForGuest(db(), id, token);
  return NextResponse.json({ reference: b.reference, status: b.status, startsAt: b.startsAt, kind: b.kind });
});
