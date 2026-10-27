import { addDaysToLocalDate, addMinutes, localToUtc, localWeekday, overlaps } from "@/lib/time";

export type Interval = { start: Date; end: Date };

export type WeeklyRule = {
  weekday: number;
  startTime: string;
  endTime: string;
  slotStepMinutes: number;
  validFrom?: Date | null;
  validUntil?: Date | null;
};

export type SlotQuery = {
  rules: WeeklyRule[];
  /** Extra one-off opening windows. */
  openings: Interval[];
  /** Everything that occupies the provider: active bookings' block intervals, external busy, block exceptions. */
  busy: Interval[];
  fromDate: string; // facility-local YYYY-MM-DD
  days: number;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  now: Date;
  timeZone: string;
};

export type Slot = { start: Date; end: Date; blockStart: Date; blockEnd: Date };

/**
 * Pure slot generator. A slot is offered when:
 *  - the appointment [start, end) sits fully inside an availability window,
 *  - the occupied block [start - before, end + after) overlaps nothing busy,
 *  - start respects minimum notice and maximum advance booking.
 */
export function computeSlots(q: SlotQuery): Slot[] {
  const earliest = addMinutes(q.now, q.minNoticeMinutes);
  const latest = addMinutes(q.now, q.maxAdvanceDays * 24 * 60);
  const windows: (Interval & { step: number })[] = [];

  for (let i = 0; i < q.days; i++) {
    const date = addDaysToLocalDate(q.fromDate, i);
    const weekday = localWeekday(date, q.timeZone);
    for (const r of q.rules) {
      if (r.weekday !== weekday) continue;
      const start = localToUtc(date, r.startTime, q.timeZone);
      const end = localToUtc(date, r.endTime, q.timeZone);
      if (r.validFrom && end <= r.validFrom) continue;
      if (r.validUntil && start >= r.validUntil) continue;
      windows.push({ start, end, step: r.slotStepMinutes });
    }
  }
  for (const o of q.openings) windows.push({ ...o, step: 15 });

  const seen = new Set<number>();
  const slots: Slot[] = [];
  for (const w of windows) {
    for (let s = w.start; addMinutes(s, q.durationMinutes) <= w.end; s = addMinutes(s, w.step)) {
      const end = addMinutes(s, q.durationMinutes);
      if (s < earliest || s > latest) continue;
      const blockStart = addMinutes(s, -q.bufferBeforeMinutes);
      const blockEnd = addMinutes(end, q.bufferAfterMinutes);
      if (q.busy.some((b) => overlaps(blockStart, blockEnd, b.start, b.end))) continue;
      if (seen.has(s.getTime())) continue;
      seen.add(s.getTime());
      slots.push({ start: s, end, blockStart, blockEnd });
    }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}
