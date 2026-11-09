import { describe, expect, it } from "vitest";
import { formatBusinessDate, formatBusinessDateTime, formatCalendarDate, formatCents, formatMonthYear } from "./format";

describe("formatBusinessDateTime", () => {
  it("shows New York local time", () => {
    // 21:05 UTC on Nov 6 (EST, UTC-5) is 4:05 PM in New York.
    expect(formatBusinessDateTime("2026-11-06T21:05:00Z")).toMatch(/Nov 6, 2026,? 4:05\sPM/);
  });
});

describe("formatCents", () => {
  it("formats integer cents as US dollars", () => {
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(-2000)).toBe("-$20.00");
  });

  it("rejects non-integer amounts", () => {
    expect(() => formatCents(10.5)).toThrow(TypeError);
  });
});

describe("formatBusinessDate", () => {
  it("uses New York time, not UTC", () => {
    // 03:30 UTC on Dec 1 is still Nov 30 in New York (EST, UTC-5).
    expect(formatBusinessDate("2026-12-01T03:30:00Z")).toBe("Nov 30, 2026");
  });

  it("handles daylight saving time", () => {
    // 03:30 UTC on Jul 1 is still Jun 30 in New York (EDT, UTC-4).
    expect(formatBusinessDate("2026-07-01T03:30:00Z")).toBe("Jun 30, 2026");
  });
});

describe("month and calendar date labels", () => {
  it("formats without any time-zone shift", () => {
    expect(formatMonthYear("2026-11-01")).toBe("November 2026");
    expect(formatMonthYear("2027-01-01")).toBe("January 2027");
    expect(formatCalendarDate("2026-12-01")).toBe("Dec 1, 2026");
    expect(formatCalendarDate("2026-12-01T00:00:00.000Z")).toBe("Dec 1, 2026");
  });
});
