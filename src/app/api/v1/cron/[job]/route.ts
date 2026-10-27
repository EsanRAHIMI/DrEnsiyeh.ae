import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { JOBS, runJob, type Job } from "@/server/jobs";
import { bookingDeps } from "@/server/deps";

/** Scheduler entry point (Kubernetes CronJob / GitHub Actions / platform cron). Bearer CRON_SECRET. */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/cron/[job]">) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { job } = await ctx.params;
  if (!(JOBS as readonly string[]).includes(job)) return NextResponse.json({ error: "unknown job" }, { status: 404 });
  const started = Date.now();
  try {
    const result = await runJob(job as Job, await bookingDeps());
    return NextResponse.json({ job, ms: Date.now() - started, result });
  } catch (e) {
    console.error(`[cron:${job}]`, e instanceof Error ? e.message : e);
    return NextResponse.json({ job, error: "failed" }, { status: 500 });
  }
}
