/**
 * New York wall-clock helpers (PROJECT_SCOPE.md §0 rule 5). Staff type dates and times as the
 * store sees them; the server turns them into exact instants, daylight saving time included,
 * no matter what time zone the staff member's own computer is set to.
 */

const TIME_ZONE = "America/New_York";

function parts(instant: Date, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const formatted = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hourCycle: "h23", ...options }).formatToParts(
    instant,
  );
  return Object.fromEntries(formatted.map((p) => [p.type, p.value]));
}

/** "2026-11-06" — the New York calendar date of an instant. */
export function nyDateString(instant: Date): string {
  const p = parts(instant, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

/** "14:05" — the New York time of day of an instant. */
export function nyTimeString(instant: Date): string {
  const p = parts(instant, { hour: "2-digit", minute: "2-digit" });
  return `${p.hour}:${p.minute}`;
}

/** "2026-11-01" — first day of the New York month of an instant. */
export function nyMonthStartString(instant: Date): string {
  return `${nyDateString(instant).slice(0, 7)}-01`;
}

/** Offset of New York from UTC at an instant, in ms (negative: EST = −5h, EDT = −4h). */
function nyOffsetMs(instant: Date): number {
  const p = parts(instant, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const wallAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Turns "2026-07-01" + "14:30" (New York wall time) into the exact instant.
 * During the autumn "repeated hour" the first occurrence is used; during the spring
 * "missing hour" the time is moved forward to the next valid moment.
 */
export function nyWallTimeToInstant(date: string, time: string): Date {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) throw new RangeError("Expected a date like 2026-07-01 and a time like 14:30");
  const [year, month, day, hour, minute] = [+d[1], +d[2], +d[3], +t[1], +t[2]];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    throw new RangeError("Date or time out of range");
  }

  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let instant = wallAsUtc - nyOffsetMs(new Date(wallAsUtc));
  instant = wallAsUtc - nyOffsetMs(new Date(instant)); // second pass settles the DST edge cases
  const result = new Date(instant);
  if (Number.isNaN(result.getTime())) throw new RangeError("Invalid date");
  return result;
}

/** "2026-11-01" + 2 → "2027-01-01". Works on the first day of a month; pure string/number math. */
export function addMonths(monthStart: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-01$/.exec(monthStart);
  if (!m) throw new RangeError("Expected the first day of a month, like 2026-11-01");
  const index = +m[1] * 12 + (+m[2] - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
