/**
 * Small timezone helpers built on Intl so we do not need a timezone library.
 * All instants are stored as UTC Dates; the company timezone is only used for
 * display and for interpreting "07:00 on 2026-09-14".
 */

export const DEFAULT_TZ = "Europe/London";

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsInZone(date: Date, tz: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour === 24 ? 0 : map.hour,
    minute: map.minute,
    second: map.second,
  };
}

/** Offset (ms) of the timezone at the given instant: local = utc + offset. */
export function tzOffsetMs(date: Date, tz: string): number {
  const p = partsInZone(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "YYYY-MM-DD" for the instant in the given timezone. */
export function toDateString(date: Date, tz = DEFAULT_TZ): string {
  const p = partsInZone(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** "HH:mm" for the instant in the given timezone. */
export function formatTime(date: Date | null | undefined, tz = DEFAULT_TZ): string {
  if (!date) return "";
  const p = partsInZone(date, tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Mon 14 Sep, 09:30". Assembled by hand so server and browser always agree. */
export function formatDateTime(date: Date | null | undefined, tz = DEFAULT_TZ): string {
  if (!date) return "";
  const p = partsInZone(date, tz);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return `${WEEKDAYS[dow].slice(0, 3)} ${p.day} ${MONTHS[p.month - 1].slice(0, 3)}, ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** "Monday 14 September 2026" for a "YYYY-MM-DD" string. */
export function formatLongDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[dow]} ${d} ${MONTHS[m - 1]} ${y}`;
}

/** Build the UTC instant for a local wall-clock time ("YYYY-MM-DD", "HH:mm") in tz. */
export function zonedDateTime(dateStr: string, time: string, tz = DEFAULT_TZ): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0);
  // First approximation using the offset at the guessed instant, then correct once for DST edges.
  let result = guess - tzOffsetMs(new Date(guess), tz);
  result = guess - tzOffsetMs(new Date(result), tz);
  return new Date(result);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** ISO weekday 1 (Mon) .. 7 (Sun) for a "YYYY-MM-DD" string. */
export function isoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

export function todayString(tz = DEFAULT_TZ): string {
  return toDateString(new Date(), tz);
}

export function isValidDateString(s: string | null | undefined): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatDistance(meters: number): string {
  const miles = meters / 1609.344;
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}
