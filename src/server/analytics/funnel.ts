import "server-only";
import { cookies } from "next/headers";
import { db } from "@/db";
import { funnelEvents } from "@/db/schema";

type Step = (typeof funnelEvents.$inferInsert)["step"];

export async function hasAnalyticsConsent(): Promise<boolean> {
  const raw = (await cookies()).get("dr_consent")?.value;
  if (!raw) return false;
  try {
    return JSON.parse(decodeURIComponent(raw)).analytics === true;
  } catch {
    return false;
  }
}

/**
 * Records an aggregate funnel step. Contains NO personal or medical data: only the step,
 * the coarse booking kind (clinic | home_visit) and the campaign attribution id.
 * Without analytics consent, only a fully anonymous count is stored (no ids at all).
 */
export async function recordFunnel(step: Step, opts: { kind?: string; attributionId?: string | null; path?: string } = {}) {
  try {
    const consent = await hasAnalyticsConsent();
    const jar = await cookies();
    await db().insert(funnelEvents).values({
      step,
      kind: opts.kind ?? null,
      path: opts.path?.slice(0, 200) ?? null,
      anonymousId: consent ? (jar.get("dr_anon")?.value ?? null) : null,
      attributionId: consent ? (opts.attributionId ?? null) : null,
    });
  } catch {
    // measurement never blocks booking
  }
}
