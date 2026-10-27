import type { Db, Tx } from "@/db";
import { auditLog } from "@/db/schema";

export type Actor = { userId: string | null; role: string; type: "patient" | "staff" | "system" | "stripe" };

export const SYSTEM: Actor = { userId: null, role: "system", type: "system" };

export async function audit(
  database: Db | Tx,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string | null,
  details?: Record<string, unknown>,
) {
  await database.insert(auditLog).values({
    actorUserId: actor.userId,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    details: details ?? null,
  });
}
