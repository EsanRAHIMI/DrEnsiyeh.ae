import { NextResponse } from "next/server";
import { z } from "zod";
import { submitDetailsAndCheckout } from "@/server/booking/engine";
import { bookingDeps } from "@/server/deps";
import { handle, limitOr429 } from "@/server/http";
import { db } from "@/db";
import { consents } from "@/db/schema";
import { recordFunnel } from "@/server/analytics/funnel";

const B = z.object({
  token: z.string().min(10),
  fullName: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number"),
  forSomeoneElse: z.boolean().optional(),
  acceptedPolicyVersion: z.string().min(1).max(20),
  whatsappOptIn: z.boolean().optional(),
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/v1/bookings/[id]/checkout">) => {
  const limited = limitOr429(req, "checkout", 10, 10 * 60_000);
  if (limited) return limited;
  const { id } = await ctx.params;
  const body = B.parse(await req.json());
  const deps = await bookingDeps();
  const out = await submitDetailsAndCheckout(deps, id, body.token, body);
  await db().insert(consents).values([
    { anonymousId: `booking:${out.booking.id}`, userId: out.booking.accountUserId, purpose: "booking_policy", granted: true, documentVersion: body.acceptedPolicyVersion, source: "booking_form" },
    { anonymousId: `booking:${out.booking.id}`, userId: out.booking.accountUserId, purpose: "whatsapp_notifications", granted: !!body.whatsappOptIn, documentVersion: body.acceptedPolicyVersion, source: "booking_form" },
  ]);
  await recordFunnel(out.type === "redirect" ? "checkout_started" : "booking_completed", { kind: out.booking.kind, attributionId: out.booking.attributionId });
  if (out.type === "redirect") return NextResponse.json({ type: "redirect", url: out.url });
  return NextResponse.json({ type: "requested", reference: out.booking.reference });
});
