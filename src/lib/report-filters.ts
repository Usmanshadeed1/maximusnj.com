/**
 * The filters on the Dashboard and Reports pages: a store and a date range (New York days).
 * They live in the page address, so a filtered view can be bookmarked or shared.
 */

export type ReportPreset = "today" | "7d" | "30d" | "90d" | "month" | "last-month";

export const PRESETS: { key: ReportPreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "90d", label: "Last 90 days" },
];

export type ReportFilters = { from: string; to: string; storeId: string | null; preset: ReportPreset | null };

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toMs(date: string): number {
  return Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
}
function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** "2026-11-09" + 3 → "2026-11-12" (plain calendar math, no time zones involved). */
export function addDays(date: string, days: number): string {
  return fromMs(toMs(date) + days * DAY_MS);
}

function isRealDate(value: string): boolean {
  return DATE.test(value) && fromMs(toMs(value)) === value;
}

export function presetRange(preset: ReportPreset, today: string): { from: string; to: string } {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "last-month": {
      const firstThis = `${today.slice(0, 7)}-01`;
      const lastPrev = addDays(firstThis, -1);
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
    }
  }
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Reads and cleans the filters from the page address. Anything odd falls back to the last 30 days. */
export function parseReportFilters(params: Params, today: string): ReportFilters {
  const storeRaw = one(params.store);
  const storeId = storeRaw && UUID.test(storeRaw) ? storeRaw : null;
  const presetRaw = one(params.range);
  const preset = PRESETS.find((p) => p.key === presetRaw)?.key ?? null;
  const fromRaw = one(params.from);
  const toRaw = one(params.to);

  let range: { from: string; to: string };
  let used: ReportPreset | null = null;
  if (fromRaw && toRaw && isRealDate(fromRaw) && isRealDate(toRaw)) {
    range = fromRaw <= toRaw ? { from: fromRaw, to: toRaw } : { from: toRaw, to: fromRaw };
    if (toMs(range.to) - toMs(range.from) > 366 * DAY_MS) range = { from: addDays(range.to, -366), to: range.to };
  } else {
    used = preset ?? "30d";
    range = presetRange(used, today);
  }
  return { ...range, storeId, preset: used };
}

/** The page address (without the path) for a set of filters, e.g. "range=7d&store=…". */
export function filterQuery(filters: { storeId: string | null }, range: { preset?: ReportPreset; from?: string; to?: string }): string {
  const q = new URLSearchParams();
  if (range.preset) q.set("range", range.preset);
  if (range.from && range.to) {
    q.set("from", range.from);
    q.set("to", range.to);
  }
  if (filters.storeId) q.set("store", filters.storeId);
  return q.toString();
}
