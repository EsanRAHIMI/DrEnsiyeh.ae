import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { createHold } from "@/server/booking/engine";
import { bookingDeps } from "@/server/deps";
import { handle, limitOr429 } from "@/server/http";
import { getSessionUser } from "@/server/auth/session";
import { recordFunnel } from "@/server/analytics/funnel";

const B = z.object({
  offeringId: z.uuid(),
  startsAt: z.iso.datetime(),
  idempotencyKey: z.string().min(16).max(80),
  home: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      address: z.string().min(5).max(300),
      accessNotes: z.string().max(500).optional(),
    })
    .optional(),
});

export const POST = handle(async (req: Request) => {
  const limited = limitOr429(req, "hold", 20, 10 * 60_000);
  if (limited) return limited;
  const body = B.parse(await req.json());
  const user = await getSessionUser();
  const attributionId = (await cookies()).get("dr_attr")?.value ?? null;
  const { booking, accessToken } = await createHold(await bookingDeps(), {
    offeringId: body.offeringId,
    startsAt: new Date(body.startsAt),
    idempotencyKey: body.idempotencyKey,
    home: body.home,
    accountUserId: user?.userId ?? null,
    attributionId: attributionId && /^[0-9a-f-]{36}$/.test(attributionId) ? attributionId : null,
  });
  await recordFunnel("slot_selected", { kind: booking.kind, attributionId: booking.attributionId });
  return NextResponse.json({
    bookingId: booking.id,
    token: accessToken,
    reference: booking.reference,
    holdExpiresAt: booking.holdExpiresAt,
    totalMinor: booking.totalMinor,
    surchargeMinor: booking.surchargeMinor,
    currency: booking.currency,
    paymentMode: booking.paymentMode,
  });
});
