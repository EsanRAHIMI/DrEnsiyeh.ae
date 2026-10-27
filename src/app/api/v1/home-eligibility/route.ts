import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { checkHomeEligibility } from "@/server/booking/engine";
import { handle, limitOr429 } from "@/server/http";

const B = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export const POST = handle(async (req: Request) => {
  const limited = limitOr429(req, "elig", 60, 60_000);
  if (limited) return limited;
  const { lat, lng } = B.parse(await req.json());
  const r = await checkHomeEligibility(db(), lat, lng);
  return NextResponse.json(r.eligible ? { eligible: true, zoneName: r.zoneName, surchargeMinor: r.surchargeMinor } : { eligible: false });
});
