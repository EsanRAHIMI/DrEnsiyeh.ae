import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { bookings, calendarConnections, calendarEventLinks, externalBusy } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { ACTIVE_STATUSES } from "@/server/booking/engine";
import { enqueue } from "@/server/notifications/outbox";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.freebusy", "openid", "email"];

export function authUrl(redirectUri: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: SCOPES.join(" "),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type Fetcher = typeof fetch;

export async function exchangeCode(code: string, redirectUri: string, f: Fetcher = fetch) {
  const res = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!, client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!res.ok) throw new Error(`token exchange ${res.status}`);
  const body = (await res.json()) as { refresh_token?: string; id_token?: string };
  if (!body.refresh_token) throw new Error("No refresh token returned (revoke previous grant and retry)");
  const email = body.id_token ? (JSON.parse(Buffer.from(body.id_token.split(".")[1], "base64url").toString()) as { email?: string }).email : undefined;
  return { refreshToken: body.refresh_token, email };
}

async function accessToken(conn: typeof calendarConnections.$inferSelect, f: Fetcher) {
  const res = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: decrypt(conn.refreshTokenEnc), client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!, client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!, grant_type: "refresh_token" }),
  });
  if (res.status === 400 || res.status === 401) throw new Error("revoked");
  if (!res.ok) throw new Error(`token refresh ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function saveConnection(database: Db, providerId: string, refreshToken: string, email?: string) {
  await database.update(calendarConnections).set({ status: "revoked" }).where(eq(calendarConnections.providerId, providerId));
  await database.insert(calendarConnections).values({ providerId, refreshTokenEnc: encrypt(refreshToken), googleAccountEmail: email ?? null });
}

/**
 * Minimal, privacy-preserving event body. No patient name, no diagnosis, no service name.
 * The internal database stays authoritative; Google is a mirror.
 */
export function eventBody(b: typeof bookings.$inferSelect, baseUrl: string) {
  return {
    summary: `Medical Appointment — Booking #${b.reference}`,
    description: `${b.kind === "home_visit" ? "Home visit" : "Clinic"} · details in the practice dashboard: ${baseUrl}/admin/appointments/${b.id}`,
    start: { dateTime: b.startsAt.toISOString(), timeZone: "Asia/Dubai" },
    end: { dateTime: b.endsAt.toISOString(), timeZone: "Asia/Dubai" },
    visibility: "private",
    transparency: "opaque",
    extendedProperties: { private: { drBookingId: b.id } },
    reminders: { useDefault: true },
  };
}

/**
 * Reconciles dirty event links (desiredVersion > syncedVersion). Idempotent and resumable:
 * each successful write records the version it reflects; failures retry on the next run.
 */
export async function syncCalendar(database: Db, baseUrl: string, f: Fetcher = fetch) {
  const conns = await database.select().from(calendarConnections).where(eq(calendarConnections.status, "active"));
  const result = { pushed: 0, deleted: 0, failed: 0, busy: 0 };
  for (const conn of conns) {
    let token: string;
    try {
      token = await accessToken(conn, f);
    } catch (e) {
      const revoked = e instanceof Error && e.message === "revoked";
      await database.update(calendarConnections).set({ status: revoked ? "revoked" : "error", lastError: e instanceof Error ? e.message : "error" }).where(eq(calendarConnections.id, conn.id));
      await enqueue(database, { dedupeKey: `ops:calendar:${conn.id}:${new Date().toISOString().slice(0, 13)}`, channel: "email", template: "ops_alert", recipientAddress: process.env.OPS_ALERT_EMAIL ?? null, params: { kind: "Google Calendar sync failed", detail: revoked ? "Access revoked — reconnect in Settings" : "Token refresh failed" } });
      continue;
    }
    const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const cal = encodeURIComponent(conn.writeCalendarId);
    const dirty = await database
      .select({ link: calendarEventLinks, b: bookings })
      .from(calendarEventLinks)
      .innerJoin(bookings, eq(bookings.id, calendarEventLinks.bookingId))
      .where(and(eq(calendarEventLinks.connectionId, conn.id), sql`${calendarEventLinks.desiredVersion} > ${calendarEventLinks.syncedVersion}`, lt(calendarEventLinks.attempts, 10)))
      .limit(50);
    for (const { link, b } of dirty) {
      try {
        const active = (ACTIVE_STATUSES as string[]).includes(b.status) && b.status !== "hold" && b.status !== "pending_payment";
        let eventId = link.googleEventId;
        if (!active) {
          if (eventId) {
            const r = await f(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events/${eventId}`, { method: "DELETE", headers: auth });
            if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`delete ${r.status}`);
            result.deleted++;
          }
          eventId = null;
        } else if (eventId) {
          const r = await f(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events/${eventId}`, { method: "PUT", headers: auth, body: JSON.stringify(eventBody(b, baseUrl)) });
          if (r.status === 404 || r.status === 410) eventId = null;
          else if (!r.ok) throw new Error(`update ${r.status}`);
          else result.pushed++;
        }
        if (active && !eventId) {
          const r = await f(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events`, { method: "POST", headers: auth, body: JSON.stringify(eventBody(b, baseUrl)) });
          if (!r.ok) throw new Error(`insert ${r.status}`);
          eventId = ((await r.json()) as { id: string }).id;
          result.pushed++;
        }
        await database.update(calendarEventLinks).set({ googleEventId: eventId, syncedVersion: link.desiredVersion, attempts: 0, lastError: null, updatedAt: new Date() }).where(eq(calendarEventLinks.bookingId, link.bookingId));
      } catch (e) {
        result.failed++;
        await database.update(calendarEventLinks).set({ attempts: link.attempts + 1, lastError: e instanceof Error ? e.message : "error", updatedAt: new Date() }).where(eq(calendarEventLinks.bookingId, link.bookingId));
      }
    }

    // Pull busy times (next 60 days) so personal events block online availability.
    try {
      const timeMin = new Date();
      const timeMax = new Date(Date.now() + 60 * 86400_000);
      const r = await f("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), timeZone: "Asia/Dubai", items: conn.busyCalendarIds.map((id) => ({ id })) }),
      });
      if (!r.ok) throw new Error(`freeBusy ${r.status}`);
      const body = (await r.json()) as { calendars: Record<string, { busy: { start: string; end: string }[] }> };
      // Our own events appear as busy too; they're excluded by matching booking intervals.
      const own = await database.select({ s: bookings.startsAt, e: bookings.endsAt }).from(bookings).where(and(eq(bookings.providerId, conn.providerId), gte(bookings.endsAt, timeMin)));
      const ownKeys = new Set(own.map((o) => `${o.s.getTime()}-${o.e.getTime()}`));
      const busy = Object.values(body.calendars)
        .flatMap((c) => c.busy)
        .map((x) => ({ start: new Date(x.start), end: new Date(x.end) }))
        .filter((x) => !ownKeys.has(`${x.start.getTime()}-${x.end.getTime()}`));
      await database.transaction(async (tx) => {
        await tx.delete(externalBusy).where(and(eq(externalBusy.providerId, conn.providerId), eq(externalBusy.source, `google:${conn.id}`)));
        if (busy.length) await tx.insert(externalBusy).values(busy.map((x) => ({ providerId: conn.providerId, source: `google:${conn.id}`, startsAt: x.start, endsAt: x.end })));
      });
      result.busy += busy.length;
      await database.update(calendarConnections).set({ lastSyncAt: new Date(), lastError: null, status: "active" }).where(eq(calendarConnections.id, conn.id));
    } catch (e) {
      await database.update(calendarConnections).set({ lastError: e instanceof Error ? e.message : "error" }).where(eq(calendarConnections.id, conn.id));
    }
  }
  return result;
}
