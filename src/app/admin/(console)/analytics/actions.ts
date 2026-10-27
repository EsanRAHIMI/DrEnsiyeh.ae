"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { adSpend } from "@/db/schema";
import { actorOf, requireStaff } from "@/server/auth/session";
import { audit } from "@/server/audit";

const Row = z.object({ platform: z.enum(["google", "meta", "linkedin", "tiktok", "snapchat"]), campaign: z.string().min(1).max(200), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), spend: z.coerce.number().nonnegative(), impressions: z.coerce.number().int().optional(), clicks: z.coerce.number().int().optional() });

/** CSV import of advertising cost (platform,campaign,date,spend_aed,impressions,clicks). Cost data only. */
export async function importAdSpend(_: unknown, form: FormData) {
  const u = await requireStaff("revenue:read");
  const csv = String(form.get("csv") ?? "").trim();
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const start = /platform/i.test(lines[0] ?? "") ? 1 : 0;
  let n = 0;
  try {
    for (const line of lines.slice(start)) {
      const [platform, campaign, date, spend, impressions, clicks] = line.split(",").map((s) => s.trim());
      const r = Row.parse({ platform: platform?.toLowerCase(), campaign, date, spend, impressions: impressions || undefined, clicks: clicks || undefined });
      await db()
        .insert(adSpend)
        .values({ platform: r.platform, campaign: r.campaign, date: r.date, spendMinor: Math.round(r.spend * 100), impressions: r.impressions ?? null, clicks: r.clicks ?? null })
        .onConflictDoUpdate({ target: [adSpend.platform, adSpend.campaign, adSpend.date], set: { spendMinor: Math.round(r.spend * 100), impressions: r.impressions ?? null, clicks: r.clicks ?? null } });
      n++;
    }
  } catch (e) {
    return { error: e instanceof z.ZodError ? `Row ${n + 1 + start}: ${e.issues[0]?.message}` : "Import failed" };
  }
  await audit(db(), actorOf(u), "ad_spend.import", "ad_spend", null, { rows: n });
  revalidatePath("/admin/analytics");
  return { ok: true };
}
