import { describe, expect, it } from "vitest";
import { TRANSACTION_TYPES, qualifyingCents } from "./transactions";

describe("qualifyingCents (mirrors the database rule)", () => {
  it("purchases raise spend and refunds lower it", () => {
    expect(qualifyingCents("purchase", 10000, null, false)).toBe(10000);
    expect(qualifyingCents("refund", 2000, null, false)).toBe(-2000);
  });

  it("trades and membership payments never count", () => {
    expect(qualifyingCents("trade_buyin", 5000, null, false)).toBe(0);
    expect(qualifyingCents("membership_payment", 4000, null, true)).toBe(0);
  });

  it("adjustments count only when flagged, in their direction", () => {
    expect(qualifyingCents("adjustment", 500, "credit", true)).toBe(500);
    expect(qualifyingCents("adjustment", 500, "debit", true)).toBe(-500);
    expect(qualifyingCents("adjustment", 500, "credit", false)).toBe(0);
  });

  it("net spend after the Owner-test scenario is $80", () => {
    const net =
      qualifyingCents("purchase", 10000, null, false) +
      qualifyingCents("refund", 2000, null, false) +
      qualifyingCents("trade_buyin", 5000, null, false);
    expect(net).toBe(8000);
  });
});

describe("TRANSACTION_TYPES", () => {
  it("lists all five types", () => {
    expect(TRANSACTION_TYPES).toEqual(["purchase", "refund", "trade_buyin", "membership_payment", "adjustment"]);
  });
});
