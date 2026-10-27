import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { safeEqual } from "@/lib/crypto";

/** Meta webhook verification handshake. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("hub.mode") === "subscribe" && process.env.WHATSAPP_VERIFY_TOKEN && u.searchParams.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

/** Delivery status updates (sent/delivered/read/failed). Inbound patient messages are not processed here. */
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !safeEqual(sig, `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`)) return new NextResponse("invalid signature", { status: 401 });
  const body = JSON.parse(raw) as { entry?: { changes?: { value?: { statuses?: { id: string; status: string; errors?: { title?: string }[] }[] } }[] }[] };
  for (const e of body.entry ?? []) {
    for (const c of e.changes ?? []) {
      for (const s of c.value?.statuses ?? []) {
        const status = s.status === "failed" ? "failed" : s.status === "delivered" || s.status === "read" ? "delivered" : null;
        if (status) await db().update(notifications).set({ status, lastError: s.errors?.[0]?.title ?? null, updatedAt: new Date() }).where(eq(notifications.providerMessageId, s.id));
      }
    }
  }
  return NextResponse.json({ ok: true });
}
