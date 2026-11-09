import { describe, expect, it } from "vitest";
import { addDays, filterQuery, parseReportFilters, presetRange } from "./report-filters";

const TODAY = "2026-11-09";
const STORE = "6f1c2b9e-4d2a-4c8e-9b1a-2f3e4d5c6b7a";

describe("addDays", () => {
  it("does plain calendar math across months and years", () => {
    expect(addDays("2026-11-09", -9)).toBe("2026-10-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("presetRange", () => {
  it("covers the usual choices", () => {
    expect(presetRange("today", TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(presetRange("7d", TODAY)).toEqual({ from: "2026-11-03", to: TODAY });
    expect(presetRange("30d", TODAY)).toEqual({ from: "2026-10-11", to: TODAY });
    expect(presetRange("month", TODAY)).toEqual({ from: "2026-11-01", to: TODAY });
    expect(presetRange("last-month", TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("last-month", "2027-01-15")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});

describe("parseReportFilters", () => {
  it("defaults to the last 30 days across all stores", () => {
    expect(parseReportFilters({}, TODAY)).toEqual({ from: "2026-10-11", to: TODAY, storeId: null, preset: "30d" });
  });

  it("uses a preset, or an exact range", () => {
    expect(parseReportFilters({ range: "7d" }, TODAY).from).toBe("2026-11-03");
    const exact = parseReportFilters({ from: "2026-10-01", to: "2026-10-15", store: STORE }, TODAY);
    expect(exact).toEqual({ from: "2026-10-01", to: "2026-10-15", storeId: STORE, preset: null });
  });

  it("swaps a backwards range and caps it at a year", () => {
    expect(parseReportFilters({ from: "2026-10-15", to: "2026-10-01" }, TODAY)).toMatchObject({ from: "2026-10-01", to: "2026-10-15" });
    const long = parseReportFilters({ from: "2020-01-01", to: "2026-11-09" }, TODAY);
    expect(long.to).toBe("2026-11-09");
    expect(long.from).toBe(addDays("2026-11-09", -366));
  });

  it("ignores anything that is not a real date or a store id", () => {
    const f = parseReportFilters({ from: "2026-02-31", to: "2026-03-01", store: "'; drop table", range: "bogus" }, TODAY);
    expect(f).toEqual({ from: "2026-10-11", to: TODAY, storeId: null, preset: "30d" });
  });
});

describe("filterQuery", () => {
  it("builds the address for a preset or a range", () => {
    expect(filterQuery({ storeId: null }, { preset: "7d" })).toBe("range=7d");
    expect(filterQuery({ storeId: STORE }, { from: "2026-10-01", to: "2026-10-31" })).toBe(`from=2026-10-01&to=2026-10-31&store=${STORE}`);
  });
});
