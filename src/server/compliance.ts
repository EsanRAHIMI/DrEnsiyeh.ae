import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { settings } from "@/db/schema";
import { complianceSchema, type Compliance } from "@/lib/compliance-model";

export * from "@/lib/compliance-model";

export async function getCompliance(database: Db): Promise<Compliance> {
  const [row] = await database.select().from(settings).where(eq(settings.key, "compliance"));
  return complianceSchema.parse(row?.value ?? {});
}

