import { describe, expect, it } from "vitest";
import { clearTierOverrideSchema, setTierOverrideSchema, tierSettingsSchema } from "./tier";

const valid = {
  visitValue: "0",
  lookbackMonths: "1",
  method: "average",
  carryOver: false,
  requirePurchase: true,
  requireVisit: true,
  name_base: "Base",
  name_silver: "Silver",
  name_gold: "Gold",
  name_diamond: "Diamond",
  benefits_base: "",
  benefits_silver: "5% off",
  benefits_gold: "",
  benefits_diamond: "",
  threshold_silver: "300",
  threshold_gold: "600",
  threshold_diamond: "1,000",
};

const errorsOf = (overrides: Record<string, unknown>) => {
  const result = tierSettingsSchema.safeParse({ ...valid, ...overrides });
  return result.success ? {} : Object.fromEntries(result.error.issues.map((i) => [String(i.path[0]), i.message]));
};

describe("tierSettingsSchema", () => {
  it("turns the form into exact cents and the payload the database wants", () => {
    const parsed = tierSettingsSchema.parse(valid);
    expect(parsed.visitValueCents).toBe(0);
    expect(parsed.lookbackMonths).toBe(1);
    expect(parsed.tiers.map((t) => t.threshold_cents)).toEqual([0, 30000, 60000, 100000]);
    expect(parsed.tiers.map((t) => t.tier_key)).toEqual(["base", "silver", "gold", "diamond"]);
    expect(parsed.tiers[1].benefits_text).toBe("5% off");
    expect(parsed.tiers[2].benefits_text).toBeNull();
  });

  it("accepts $0 for the visit value and a decimal one", () => {
    expect(tierSettingsSchema.parse({ ...valid, visitValue: "0" }).visitValueCents).toBe(0);
    expect(tierSettingsSchema.parse({ ...valid, visitValue: "$20.50" }).visitValueCents).toBe(2050);
  });

  it("requires the thresholds to go up", () => {
    expect(errorsOf({ threshold_gold: "300" }).threshold_gold).toMatch(/more than the tier below/);
    expect(errorsOf({ threshold_diamond: "500" }).threshold_diamond).toMatch(/more than the tier below/);
    expect(errorsOf({ threshold_silver: "0" }).threshold_silver).toBeDefined();
    expect(errorsOf({ threshold_silver: "abc" }).threshold_silver).toMatch(/valid amount/);
  });

  it("needs a different name for each tier, ignoring case", () => {
    expect(errorsOf({ name_gold: "silver" }).name_gold).toMatch(/different name/);
    expect(errorsOf({ name_silver: "   " }).name_silver).toMatch(/name/);
  });

  it("limits the look-back to 1–24 whole months", () => {
    expect(errorsOf({ lookbackMonths: "0" }).lookbackMonths).toBeDefined();
    expect(errorsOf({ lookbackMonths: "25" }).lookbackMonths).toBeDefined();
    expect(errorsOf({ lookbackMonths: "1.5" }).lookbackMonths).toBeDefined();
    expect(errorsOf({ lookbackMonths: "12" })).toEqual({});
  });

  it("only allows carry-over with a 1-month look-back", () => {
    expect(errorsOf({ carryOver: true, lookbackMonths: "3" }).carryOver).toMatch(/1 month/);
    expect(errorsOf({ carryOver: true, lookbackMonths: "1" })).toEqual({});
  });
});

describe("setTierOverrideSchema", () => {
  const customerId = "7a2d3c0f-5e3b-4d9f-8c2b-3a4f5e6d7c8b";

  it("needs a tier and a reason", () => {
    expect(setTierOverrideSchema.safeParse({ customerId, tier: "gold", reason: "", endMode: "none" }).success).toBe(false);
    expect(setTierOverrideSchema.safeParse({ customerId, tier: "platinum", reason: "VIP", endMode: "none" }).success).toBe(false);
  });

  it("has no end month unless one is chosen", () => {
    expect(setTierOverrideSchema.parse({ customerId, tier: "gold", reason: "VIP", endMode: "none" }).lastMonth).toBeNull();
    const dated = setTierOverrideSchema.parse({ customerId, tier: "gold", reason: "VIP", endMode: "month", endMonth: "2027-01-01" });
    expect(dated.lastMonth).toBe("2027-01-01");
    expect(setTierOverrideSchema.safeParse({ customerId, tier: "gold", reason: "VIP", endMode: "month", endMonth: "" }).success).toBe(false);
  });
});

describe("clearTierOverrideSchema", () => {
  it("needs a reason", () => {
    const customerId = "7a2d3c0f-5e3b-4d9f-8c2b-3a4f5e6d7c8b";
    expect(clearTierOverrideSchema.safeParse({ customerId, reason: "" }).success).toBe(false);
    expect(clearTierOverrideSchema.safeParse({ customerId, reason: "Promotion ended" }).success).toBe(true);
  });
});
