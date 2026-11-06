import { describe, expect, it } from "vitest";
import { CODE128_PATTERNS, code128BValues, encodeCode128B } from "./code128";

describe("Code 128 pattern table", () => {
  it("has 107 symbols, each 11 modules wide (stop is 13)", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    CODE128_PATTERNS.forEach((pattern, value) => {
      const width = [...pattern].reduce((sum, d) => sum + Number(d), 0);
      expect(width, `symbol ${value}`).toBe(value === 106 ? 13 : 11);
    });
  });

  it("has no duplicate symbols", () => {
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
  });
});

describe("code128BValues", () => {
  it("wraps data in Start B, checksum and Stop", () => {
    // "A"=33, "B"=34 → checksum (104 + 33×1 + 34×2) mod 103 = 102
    expect(code128BValues("AB")).toEqual([104, 33, 34, 102, 106]);
  });

  it("encodes a member number", () => {
    const values = code128BValues("MAX000001");
    expect(values[0]).toBe(104);
    expect(values.at(-1)).toBe(106);
    expect(values).toHaveLength(9 + 3);
  });

  it("rejects characters outside code set B", () => {
    expect(() => code128BValues("é")).toThrow(RangeError);
    expect(() => code128BValues("")).toThrow(RangeError);
  });
});

describe("encodeCode128B", () => {
  it("produces 11 modules per symbol plus a 13-module stop", () => {
    const widths = encodeCode128B("MAX000001");
    const total = widths.reduce((a, b) => a + b, 0);
    // start + 9 data + checksum = 11 symbols × 11, plus stop 13
    expect(total).toBe(11 * 11 + 13);
  });
});
