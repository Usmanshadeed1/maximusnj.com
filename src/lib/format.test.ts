import { describe, expect, it } from "vitest";
import { formatBusinessDate, formatCents } from "./format";

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
