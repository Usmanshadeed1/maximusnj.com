import { describe, expect, it } from "vitest";
import { MAX_AMOUNT_CENTS, centsToInput, parseMoneyToCents } from "./money";

const cents = (input: string) => {
  const result = parseMoneyToCents(input);
  return result.ok ? result.cents : result.error;
};

describe("parseMoneyToCents", () => {
  it("turns text into exact cents", () => {
    expect(cents("100")).toBe(10000);
    expect(cents("19.99")).toBe(1999);
    expect(cents("0.05")).toBe(5);
    expect(cents(".5")).toBe(50);
    expect(cents("100.5")).toBe(10050);
    expect(cents("$1,234.56")).toBe(123456);
    expect(cents(" 1 234.56 ")).toBe(123456);
  });

  it("has no floating-point drift on classic problem amounts", () => {
    // 0.1 + 0.2 style bugs and 1.15 * 100 = 114.99999999999999 must never happen.
    expect(cents("1.15")).toBe(115);
    expect(cents("0.29")).toBe(29);
    expect(cents("4.35")).toBe(435);
    expect(cents("8.20")).toBe(820);
  });

  it("rejects zero, negatives and text with a clear message", () => {
    expect(cents("0")).toMatch(/greater than \$0/);
    expect(cents("0.00")).toMatch(/greater than \$0/);
    expect(cents("-20")).toMatch(/positive amount/);
    expect(cents("(20)")).toMatch(/positive amount/);
    expect(cents("abc")).toMatch(/valid amount/);
    expect(cents("12abc")).toMatch(/valid amount/);
    expect(cents("1e3")).toMatch(/valid amount/);
    expect(cents("")).toMatch(/Enter an amount/);
    expect(cents("$")).toMatch(/valid amount/);
  });

  it("rejects more than 2 decimal places instead of rounding", () => {
    expect(cents("1.234")).toMatch(/2 decimal places/);
  });

  it("caps the amount at $1,000,000.00", () => {
    expect(cents("1000000")).toBe(MAX_AMOUNT_CENTS);
    expect(cents("1000000.01")).toMatch(/too large/);
    expect(cents("99999999999999999999")).toMatch(/too large/);
  });
});

describe("parseMoneyToCents with allowZero", () => {
  it("accepts $0 only when asked to", () => {
    expect(parseMoneyToCents("0", { allowZero: true })).toEqual({ ok: true, cents: 0 });
    expect(parseMoneyToCents("0.00", { allowZero: true })).toEqual({ ok: true, cents: 0 });
    expect(parseMoneyToCents("0").ok).toBe(false);
  });

  it("still rejects negatives and text", () => {
    expect(parseMoneyToCents("-1", { allowZero: true }).ok).toBe(false);
    expect(parseMoneyToCents("abc", { allowZero: true }).ok).toBe(false);
  });
});

describe("centsToInput", () => {
  it("formats cents for an input box", () => {
    expect(centsToInput(1999)).toBe("19.99");
    expect(centsToInput(5)).toBe("0.05");
    expect(() => centsToInput(1.5)).toThrow(TypeError);
  });
});
