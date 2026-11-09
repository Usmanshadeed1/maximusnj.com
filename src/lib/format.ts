/**
 * Display helpers. Money is always stored as integer cents (PROJECT_SCOPE.md §0 rule 4)
 * and all business dates are shown in America/New_York (rule 5).
 */

export const BUSINESS_TIME_ZONE = "America/New_York";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** 123456 → "$1,234.56". Throws on non-integer input so float money never slips through. */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`formatCents expects integer cents, received ${cents}`);
  }
  return usd.format(cents / 100);
}

/** Formats an instant as New York date and time, e.g. "Nov 6, 2026, 4:05 PM". */
export function formatBusinessDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Formats an instant as a New York calendar date, e.g. "Nov 6, 2026". */
export function formatBusinessDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

/** "2026-11-01" → "November 2026". A month label has no time of day, so no time-zone shifting applies. */
export function formatMonthYear(monthStart: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(`${monthStart.slice(0, 7)}-01T12:00:00Z`),
  );
}

/** "2026-12-01" → "Dec 1, 2026". A plain calendar date (no time of day). */
export function formatCalendarDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }).format(
    new Date(`${date.slice(0, 10)}T12:00:00Z`),
  );
}
