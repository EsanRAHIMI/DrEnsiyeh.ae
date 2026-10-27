import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { BookingError } from "@/server/booking/engine";
import { AuthError } from "@/server/auth/core";
import { CapabilityDisabledError } from "@/server/compliance";
import { clientIp, rateLimit } from "./ratelimit";

const STATUS: Record<string, number> = {
  slot_unavailable: 409,
  concurrent_update: 409,
  invalid_transition: 409,
  hold_expired: 410,
  not_found: 404,
  forbidden: 403,
  outside_service_area: 422,
  home_visits_disabled: 403,
  invalid_slot: 422,
  invalid_input: 422,
  rate_limited: 429,
  invalid_code: 400,
  expired: 400,
  disabled: 403,
  mfa_required: 401,
  invalid_mfa: 400,
};

/** Wraps a route handler: maps domain errors to JSON, never leaks internals or PHI. */
export function handle<A extends unknown[]>(fn: (req: Request, ...args: A) => Promise<Response>) {
  return async (req: Request, ...args: A) => {
    try {
      return await fn(req, ...args);
    } catch (err) {
      if (err instanceof BookingError || err instanceof AuthError) {
        return NextResponse.json({ error: err.code, message: err.code === "slot_unavailable" ? "That time is no longer available." : undefined }, { status: STATUS[err.code] ?? 400 });
      }
      if (err instanceof CapabilityDisabledError) return NextResponse.json({ error: "capability_disabled" }, { status: 403 });
      if (err instanceof ZodError) return NextResponse.json({ error: "invalid_input", issues: err.issues.map((i) => ({ path: i.path, message: i.message })) }, { status: 422 });
      console.error("[api] unhandled", err instanceof Error ? err.message : "unknown");
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  };
}

export function limitOr429(req: Request, bucket: string, limit: number, windowMs: number) {
  const r = rateLimit(`${bucket}:${clientIp(req)}`, limit, windowMs);
  if (!r.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(r.retryAfter) } });
  return null;
}
