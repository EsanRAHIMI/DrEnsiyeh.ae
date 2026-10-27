import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getBookingForGuest } from "@/server/booking/engine";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { handle, limitOr429 } from "@/server/http";
import { bookingDeps } from "@/server/deps";
import { syncCheckoutSession } from "@/server/jobs";

/**
 * Guest status polling after checkout. Returns only non-sensitive status fields.
 * If the patient returns from Stripe with a session id, we ask Stripe directly (server-to-server)
 * for that session's state — the redirect itself is never trusted. The session id must belong to
 * this booking, so a guest cannot probe other sessions.
 */
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/v1/bookings/[id]">) => {
  const limited = limitOr429(req, "booking-status", 60, 60_000);
  if (limited) return limited;
  const { id } = await ctx.params;
  const url = new URL(req.url);
  let b = await getBookingForGuest(db(), id, url.searchParams.get("t"));
  const sessionId = url.searchParams.get("session_id");
  if (sessionId && (b.status === "pending_payment" || b.status === "expired") && process.env.STRIPE_SECRET_KEY) {
    const [p] = await db().select().from(payments).where(and(eq(payments.bookingId, b.id), eq(payments.checkoutSessionId, sessionId)));
    if (p?.status === "open") {
      await syncCheckoutSession(await bookingDeps(), sessionId);
      b = await getBookingForGuest(db(), id, url.searchParams.get("t"));
    }
  }
  return NextResponse.json({ reference: b.reference, status: b.status, startsAt: b.startsAt, kind: b.kind });
});
