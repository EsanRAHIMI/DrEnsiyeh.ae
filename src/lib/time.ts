import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";

export const PRACTICE_TZ = "Asia/Dubai";

/** Convert a facility-local date ("2026-11-02") and time ("09:30") to a UTC Date. */
export function localToUtc(date: string, time: string, tz = PRACTICE_TZ): Date {
  return fromZonedTime(`${date}T${time}:00`, tz);
}

export function utcToLocalDate(d: Date, tz = PRACTICE_TZ): string {
  return formatInTimeZone(d, tz, "yyyy-MM-dd");
}

export function localWeekday(date: string, tz = PRACTICE_TZ): number {
  return toZonedTime(fromZonedTime(`${date}T12:00:00`, tz), tz).getDay();
}

export function formatLocal(d: Date, pattern = "EEE d MMM yyyy, HH:mm", tz = PRACTICE_TZ): string {
  return formatInTimeZone(d, tz, pattern);
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function addDaysToLocalDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}
