import { describe, expect, it } from "vitest";
import { nyDateString, nyMonthStartString, nyTimeString, nyWallTimeToInstant } from "./timezone";

describe("nyWallTimeToInstant", () => {
  it("converts summer time (EDT, UTC−4)", () => {
    expect(nyWallTimeToInstant("2026-07-01", "12:00").toISOString()).toBe("2026-07-01T16:00:00.000Z");
  });

  it("converts winter time (EST, UTC−5)", () => {
    expect(nyWallTimeToInstant("2026-12-01", "12:00").toISOString()).toBe("2026-12-01T17:00:00.000Z");
  });

  it("handles the days clocks change", () => {
    // Spring forward: Mar 8, 2026. Noon is already EDT.
    expect(nyWallTimeToInstant("2026-03-08", "12:00").toISOString()).toBe("2026-03-08T16:00:00.000Z");
    // Fall back: Nov 1, 2026. Noon is already EST.
    expect(nyWallTimeToInstant("2026-11-01", "12:00").toISOString()).toBe("2026-11-01T17:00:00.000Z");
  });

  it("puts midnight on the right side of a month boundary", () => {
    // 00:00 on Dec 1 in New York is 05:00 UTC — still Nov 30 in UTC terms is wrong; must be Dec 1 NY.
    const instant = nyWallTimeToInstant("2026-12-01", "00:00");
    expect(instant.toISOString()).toBe("2026-12-01T05:00:00.000Z");
    expect(nyDateString(instant)).toBe("2026-12-01");
    expect(nyDateString(new Date(instant.getTime() - 60_000))).toBe("2026-11-30");
  });

  it("rejects malformed input", () => {
    expect(() => nyWallTimeToInstant("2026-7-1", "12:00")).toThrow(RangeError);
    expect(() => nyWallTimeToInstant("2026-07-01", "25:00")).toThrow(RangeError);
    expect(() => nyWallTimeToInstant("2026-13-01", "10:00")).toThrow(RangeError);
  });
});

describe("New York date helpers", () => {
  it("reports the New York date and time, not UTC", () => {
    const instant = new Date("2026-12-01T03:30:00Z"); // 10:30 PM on Nov 30 in New York
    expect(nyDateString(instant)).toBe("2026-11-30");
    expect(nyTimeString(instant)).toBe("22:30");
    expect(nyMonthStartString(instant)).toBe("2026-11-01");
  });

  it("round-trips with nyWallTimeToInstant", () => {
    const instant = nyWallTimeToInstant("2026-08-15", "09:45");
    expect(nyDateString(instant)).toBe("2026-08-15");
    expect(nyTimeString(instant)).toBe("09:45");
  });
});
