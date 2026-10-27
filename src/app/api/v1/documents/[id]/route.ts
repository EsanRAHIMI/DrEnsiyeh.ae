import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getSessionUser } from "@/server/auth/session";
import { getObject, verifyDownload } from "@/server/storage";
import { clinicalAccess } from "@/server/portal";
import { can, isStaff } from "@/lib/rbac";
import { audit } from "@/server/audit";

/** Signed, short-lived, per-user document download with access re-check and audit. */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/documents/[id]">) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!verifyDownload(id, user.userId, Number(url.searchParams.get("exp")), url.searchParams.get("sig") ?? "")) return new NextResponse("Link expired", { status: 403 });
  const [doc] = await db().select().from(documents).where(eq(documents.id, id));
  if (!doc?.storageKey) return new NextResponse("Not found", { status: 404 });
  const staffOk = isStaff(user.roles) && user.mfaVerified && can(user.roles, "clinical:read");
  if (!staffOk) {
    const access = await clinicalAccess(user);
    if (!access.allowed || !access.patientIds.includes(doc.patientId) || !doc.patientVisible) return new NextResponse("Forbidden", { status: 403 });
  }
  await audit(db(), { userId: user.userId, role: user.roles.join(","), type: staffOk ? "staff" : "patient" }, "document.download", "document", id);
  const data = await getObject(doc.storageKey);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": doc.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="document-${id.slice(0, 8)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
