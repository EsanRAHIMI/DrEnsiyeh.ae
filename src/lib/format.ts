import { formatInTimeZone } from "date-fns-tz";

export const fmtDateTime = (d: Date | string) => formatInTimeZone(new Date(d), "Asia/Dubai", "EEE d MMM yyyy, HH:mm");
export const fmtDate = (d: Date | string) => formatInTimeZone(new Date(d), "Asia/Dubai", "d MMM yyyy");
