import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, homeVisitZones, offerings, services } from "@/db/schema";

export const isProductionDeploy = () => process.env.DEPLOY_ENV === "production";

/**
 * Public catalogue. In production, demo/unverified rows are never served — a facility must be
 * "verified" and a service/zone must not be flagged as demo.
 */
export async function getCatalog() {
  const rows = await db()
    .select({ service: services, offering: offerings, facility: facilities })
    .from(services)
    .innerJoin(offerings, and(eq(offerings.serviceId, services.id), eq(offerings.active, true)))
    .leftJoin(facilities, eq(facilities.id, offerings.facilityId))
    .where(eq(services.active, true))
    .orderBy(asc(services.sortOrder));
  const prod = isProductionDeploy();
  return rows.filter((r) => {
    if (!prod) return true;
    if (r.service.isDemo) return false;
    if (r.facility && (r.facility.isDemo || r.facility.status !== "verified")) return false;
    return true;
  });
}

export type CatalogRow = Awaited<ReturnType<typeof getCatalog>>[number];

export async function getPublicFacilities() {
  const rows = await db().select().from(facilities);
  return rows.filter((f) => f.status !== "inactive" && (!isProductionDeploy() || (f.status === "verified" && !f.isDemo)));
}

export async function getZones() {
  const rows = await db().select().from(homeVisitZones).where(eq(homeVisitZones.active, true));
  return rows.filter((z) => !isProductionDeploy() || !z.isDemo);
}

export async function hasDemoContent() {
  if (isProductionDeploy()) return false;
  const rows = await getCatalog();
  return rows.some((r) => r.service.isDemo || r.facility?.isDemo);
}
