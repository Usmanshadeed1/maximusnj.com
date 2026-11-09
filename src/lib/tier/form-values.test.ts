import { describe, expect, it } from "vitest";
import { tierSettingsSchema } from "@/lib/validation/tier";
import { comparableFormValues, ruleSetToFormValues } from "./form-values";
import type { TierRules } from "./engine";

const rules: TierRules = {
  visitValueCents: 2050,
  lookbackMonths: 3,
  method: "every_month",
  carryOver: false,
  requirePurchase: true,
  requireVisit: false,
  thresholds: { silver: 30000, gold: 60000, diamond: 100000 },
};
const tiers = [
  { key: "base" as const, name: "Base", benefits: null },
  { key: "silver" as const, name: "Silver", benefits: "5% off" },
  { key: "gold" as const, name: "Gold", benefits: null },
  { key: "diamond" as const, name: "Diamond", benefits: null },
];

describe("ruleSetToFormValues", () => {
  const values = ruleSetToFormValues({ rules, tiers });

  it("shows money as dollars and everything as text", () => {
    expect(values.visitValue).toBe("20.50");
    expect(values.threshold_silver).toBe("300.00");
    expect(values.threshold_diamond).toBe("1000.00");
    expect(values.lookbackMonths).toBe("3");
    expect(values.method).toBe("every_month");
    expect(values.benefits_silver).toBe("5% off");
    expect(values.benefits_gold).toBe("");
  });

  it("round-trips: the saved form is valid and gives back the same cents", () => {
    const parsed = tierSettingsSchema.parse(values);
    expect(parsed.visitValueCents).toBe(2050);
    expect(parsed.lookbackMonths).toBe(3);
    expect(parsed.tiers.map((t) => t.threshold_cents)).toEqual([0, 30000, 60000, 100000]);
  });
});

describe("comparableFormValues", () => {
  const base = ruleSetToFormValues({ rules, tiers });

  it("ignores formatting and spacing", () => {
    const retyped = { ...base, threshold_silver: "$300", threshold_diamond: "1,000", name_gold: " Gold ", lookbackMonths: "03" };
    expect(comparableFormValues(retyped)).toBe(comparableFormValues(base));
  });

  it("notices real changes", () => {
    expect(comparableFormValues({ ...base, threshold_silver: "300.01" })).not.toBe(comparableFormValues(base));
    expect(comparableFormValues({ ...base, name_gold: "Platinum" })).not.toBe(comparableFormValues(base));
    expect(comparableFormValues({ ...base, carryOver: true })).not.toBe(comparableFormValues(base));
    expect(comparableFormValues({ ...base, benefits_gold: "10% off" })).not.toBe(comparableFormValues(base));
  });
});
