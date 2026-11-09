import { describe, expect, it } from "vitest";
import { transactionSchema, voidTransactionSchema } from "./transaction";

const STORE = "6f1c2b9e-4d2a-4c8e-9b1a-2f3e4d5c6b7a";
const CUSTOMER = "7a2d3c0f-5e3b-4d9f-8c2b-3a4f5e6d7c8b";
const base = { customerId: CUSTOMER, locationId: STORE, type: "purchase", amount: "100" };

describe("transactionSchema", () => {
  it("turns a typed amount into exact cents", () => {
    const parsed = transactionSchema.parse({ ...base, amount: "$1,234.56" });
    expect(parsed.amountCents).toBe(123456);
    expect(parsed.occurredAt).toBeNull();
    expect(parsed.refundOf).toBeNull();
  });

  it("rejects $0, negative and non-numeric amounts with a clear message", () => {
    for (const amount of ["0", "-5", "abc", ""]) {
      const result = transactionSchema.safeParse({ ...base, amount });
      expect(result.success, amount).toBe(false);
      expect(result.error?.issues[0].path).toEqual(["amount"]);
    }
  });

  it("requires direction and a note for adjustments", () => {
    const result = transactionSchema.safeParse({ ...base, type: "adjustment" });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((i) => i.path[0]);
    expect(paths).toContain("direction");
    expect(paths).toContain("note");

    const ok = transactionSchema.parse({
      ...base,
      type: "adjustment",
      direction: "credit",
      note: "Goodwill",
      countsTowardTier: true,
    });
    expect(ok.direction).toBe("credit");
    expect(ok.countsTowardTier).toBe(true);
  });

  it("ignores adjustment-only fields on other types", () => {
    const parsed = transactionSchema.parse({ ...base, direction: "credit", countsTowardTier: true });
    expect(parsed.direction).toBeNull();
    expect(parsed.countsTowardTier).toBe(false);
  });

  it("keeps the refund link only for refunds", () => {
    const purchase = "8b3e4d1a-6f4c-4eaf-9d3c-4b5a6f7e8d9c";
    expect(transactionSchema.parse({ ...base, type: "refund", refundOf: purchase }).refundOf).toBe(purchase);
    expect(transactionSchema.parse({ ...base, type: "purchase", refundOf: purchase }).refundOf).toBeNull();
  });

  it("converts an earlier date and time from New York time", () => {
    const parsed = transactionSchema.parse({ ...base, earlier: true, date: "2026-07-01", time: "12:00" });
    expect(parsed.occurredAt).toBe("2026-07-01T16:00:00.000Z");
    expect(transactionSchema.safeParse({ ...base, earlier: true, date: "", time: "" }).success).toBe(false);
  });

  it("rejects an unknown type", () => {
    expect(transactionSchema.safeParse({ ...base, type: "gift" }).success).toBe(false);
  });
});

describe("voidTransactionSchema", () => {
  it("needs a reason", () => {
    const ids = { transactionId: STORE, customerId: CUSTOMER };
    expect(voidTransactionSchema.safeParse({ ...ids, reason: "" }).success).toBe(false);
    expect(voidTransactionSchema.safeParse({ ...ids, reason: "Entered twice" }).success).toBe(true);
  });
});
