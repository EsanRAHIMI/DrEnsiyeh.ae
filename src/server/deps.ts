import "server-only";
import { db } from "@/db";
import type { Deps } from "@/server/booking/engine";
import { getCompliance } from "@/server/compliance";
import { stripeGateway } from "@/server/payments/gateway";

export const baseUrl = () => process.env.APP_BASE_URL ?? "http://localhost:3000";

export async function bookingDeps(): Promise<Deps> {
  const database = db();
  return { db: database, gateway: stripeGateway(), compliance: await getCompliance(database), baseUrl: baseUrl() };
}
