import { centsToInput, parseMoneyToCents } from "@/lib/money";
import type { TierSettingsValues } from "@/lib/validation/tier";
import type { TierKey, TierRules } from "./engine";

type RuleSetLike = {
  rules: TierRules;
  tiers: { key: TierKey; name: string; benefits: string | null }[];
};

/** Saved rules → the text the Tier Settings form shows. */
export function ruleSetToFormValues(ruleSet: RuleSetLike): TierSettingsValues {
  const tier = (key: TierKey) => ruleSet.tiers.find((t) => t.key === key);
  const { rules } = ruleSet;
  return {
    visitValue: centsToInput(rules.visitValueCents),
    lookbackMonths: String(rules.lookbackMonths),
    method: rules.method,
    carryOver: rules.carryOver,
    requirePurchase: rules.requirePurchase,
    requireVisit: rules.requireVisit,
    name_base: tier("base")?.name ?? "Base",
    name_silver: tier("silver")?.name ?? "Silver",
    name_gold: tier("gold")?.name ?? "Gold",
    name_diamond: tier("diamond")?.name ?? "Diamond",
    benefits_base: tier("base")?.benefits ?? "",
    benefits_silver: tier("silver")?.benefits ?? "",
    benefits_gold: tier("gold")?.benefits ?? "",
    benefits_diamond: tier("diamond")?.benefits ?? "",
    threshold_silver: centsToInput(rules.thresholds.silver),
    threshold_gold: centsToInput(rules.thresholds.gold),
    threshold_diamond: centsToInput(rules.thresholds.diamond),
  };
}

/**
 * A stable fingerprint of the form, used to tell real changes from formatting ones:
 * "1,000", "$1000" and "1000.00" are the same amount; extra spaces don't count.
 */
export function comparableFormValues(values: TierSettingsValues): string {
  const money = (text: string) => {
    const parsed = parseMoneyToCents(text, { allowZero: true });
    return parsed.ok ? parsed.cents : text.trim();
  };
  const months = values.lookbackMonths.trim();
  return JSON.stringify({
    visit: money(values.visitValue),
    months: /^\d+$/.test(months) ? Number(months) : months,
    method: values.method,
    carry: values.carryOver,
    purchase: values.requirePurchase,
    visitRequired: values.requireVisit,
    names: [values.name_base, values.name_silver, values.name_gold, values.name_diamond].map((n) => n.trim()),
    benefits: [values.benefits_base, values.benefits_silver, values.benefits_gold, values.benefits_diamond].map((b) =>
      b.trim(),
    ),
    thresholds: [values.threshold_silver, values.threshold_gold, values.threshold_diamond].map(money),
  });
}
