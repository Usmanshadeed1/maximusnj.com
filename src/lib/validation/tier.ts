import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";
import type { LookbackMethod, TierKey } from "@/lib/tier/engine";

export const TIER_KEYS: readonly TierKey[] = ["base", "silver", "gold", "diamond"];
const UPPER_TIERS = ["silver", "gold", "diamond"] as const;

/**
 * Tier Settings form (PROJECT_SCOPE.md §7.2). Everything arrives as text and leaves as the
 * integer cents the database wants. Errors are keyed by field name so each box can show its own.
 */
export const tierSettingsSchema = z
  .object({
    visitValue: z.string(),
    lookbackMonths: z.string(),
    method: z.string(),
    carryOver: z.boolean(),
    requirePurchase: z.boolean(),
    requireVisit: z.boolean(),
    name_base: z.string(),
    name_silver: z.string(),
    name_gold: z.string(),
    name_diamond: z.string(),
    benefits_base: z.string(),
    benefits_silver: z.string(),
    benefits_gold: z.string(),
    benefits_diamond: z.string(),
    threshold_silver: z.string(),
    threshold_gold: z.string(),
    threshold_diamond: z.string(),
  })
  .superRefine((v, ctx) => {
    const fail = (path: keyof typeof v, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    const visit = parseMoneyToCents(v.visitValue, { allowZero: true });
    if (!visit.ok) fail("visitValue", visit.error);

    const months = Number(v.lookbackMonths);
    if (!/^\d+$/.test(v.lookbackMonths.trim()) || months < 1 || months > 24) {
      fail("lookbackMonths", "Choose a whole number from 1 to 24.");
    }
    if (v.method !== "average" && v.method !== "every_month") fail("method", "Choose how the months are counted.");
    if (v.carryOver && months !== 1) fail("carryOver", "Carry-over only works when you look back 1 month.");

    const names = TIER_KEYS.map((k) => v[`name_${k}` as const].trim());
    TIER_KEYS.forEach((k, i) => {
      const name = names[i];
      const key = `name_${k}` as const;
      if (name.length < 1) fail(key, "Give this tier a name.");
      else if (name.length > 30) fail(key, "Keep the name under 30 characters.");
      else if (names.findIndex((n) => n.toLowerCase() === name.toLowerCase()) !== i) {
        fail(key, "Each tier needs a different name.");
      }
      if (v[`benefits_${k}` as const].trim().length > 500) {
        fail(`benefits_${k}` as const, "Keep this under 500 characters.");
      }
    });

    let previous = 0;
    for (const k of UPPER_TIERS) {
      const key = `threshold_${k}` as const;
      const parsed = parseMoneyToCents(v[key]);
      if (!parsed.ok) {
        fail(key, parsed.error);
        continue;
      }
      if (parsed.cents <= previous) {
        fail(key, k === "silver" ? "Silver must need more than $0." : "Must be more than the tier below it.");
      }
      previous = parsed.cents;
    }
  })
  .transform((v) => {
    const money = (text: string, allowZero = false) =>
      (parseMoneyToCents(text, { allowZero }) as { ok: true; cents: number }).cents;
    return {
      visitValueCents: money(v.visitValue, true),
      lookbackMonths: Number(v.lookbackMonths),
      method: v.method as LookbackMethod,
      carryOver: v.carryOver,
      requirePurchase: v.requirePurchase,
      requireVisit: v.requireVisit,
      tiers: TIER_KEYS.map((k) => ({
        tier_key: k,
        display_name: v[`name_${k}` as const].trim(),
        threshold_cents: k === "base" ? 0 : money(v[`threshold_${k}` as `threshold_${(typeof UPPER_TIERS)[number]}`]),
        benefits_text: v[`benefits_${k}` as const].trim() || null,
      })),
    };
  });

export type TierSettingsInput = z.output<typeof tierSettingsSchema>;

/** The raw form values, as text. Used by the form's state and by the server action. */
export type TierSettingsValues = z.input<typeof tierSettingsSchema>;

export function tierSettingsFormData(formData: FormData): TierSettingsValues {
  const text = (name: string) => String(formData.get(name) ?? "");
  return {
    visitValue: text("visitValue"),
    lookbackMonths: text("lookbackMonths"),
    method: text("method"),
    carryOver: formData.get("carryOver") === "on",
    requirePurchase: formData.get("requirePurchase") === "on",
    requireVisit: formData.get("requireVisit") === "on",
    name_base: text("name_base"),
    name_silver: text("name_silver"),
    name_gold: text("name_gold"),
    name_diamond: text("name_diamond"),
    benefits_base: text("benefits_base"),
    benefits_silver: text("benefits_silver"),
    benefits_gold: text("benefits_gold"),
    benefits_diamond: text("benefits_diamond"),
    threshold_silver: text("threshold_silver"),
    threshold_gold: text("threshold_gold"),
    threshold_diamond: text("threshold_diamond"),
  };
}

export const setTierOverrideSchema = z
  .object({
    customerId: z.uuid(),
    tier: z.enum(["base", "silver", "gold", "diamond"], "Choose a tier."),
    reason: z.string().trim().min(3, "Say why you are setting this tier.").max(300, "Keep the reason under 300 characters."),
    endMode: z.enum(["none", "month"]),
    endMonth: z.string().default(""),
  })
  .superRefine((v, ctx) => {
    if (v.endMode === "month" && !/^\d{4}-\d{2}-01$/.test(v.endMonth)) {
      ctx.addIssue({ code: "custom", path: ["endMonth"], message: "Choose the month it should end." });
    }
  })
  .transform((v) => ({
    customerId: v.customerId,
    tier: v.tier,
    reason: v.reason,
    lastMonth: v.endMode === "month" ? v.endMonth : null,
  }));

export const clearTierOverrideSchema = z.object({
  customerId: z.uuid(),
  reason: z.string().trim().min(3, "Say why you are removing it.").max(300, "Keep the reason under 300 characters."),
});
