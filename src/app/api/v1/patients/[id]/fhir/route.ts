import { NextResponse } from "next/server";
import { db } from "@/db";
import { getSessionUser } from "@/server/auth/session";
import { can, isStaff, type Role } from "@/lib/rbac";
import { fhirBundle } from "@/server/emr/records";
import { capabilityBlockers, getCompliance } from "@/server/compliance";

export async function GET(_req: Request, ctx: RouteContext<"/api/v1/patients/[id]/fhir">) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.roles) || !user.mfaVerified || !can(user.roles, "clinical:read")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (capabilityBlockers(await getCompliance(db()), "emr_reference").length) return NextResponse.json({ error: "capability_disabled" }, { status: 403 });
  const { id } = await ctx.params;
  const bundle = await fhirBundle(db(), { userId: user.userId, role: user.roles.join(","), type: "staff", roles: user.roles as Role[] }, id);
  return NextResponse.json(bundle, { headers: { "Content-Type": "application/fhir+json", "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="patient-${id.slice(0, 8)}.fhir.json"` } });
}
