import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  type MonthActivity,
  type Progress,
  type TierKey,
  type TierRules,
  TIER_ORDER,
  monthPoints,
  progressToNextTier,
} from "@/lib/tier/engine";
import type { TierOverrideRow, TierProjectionJson, TierRuleSetJson, TierRulesOverview } from "@/types/database";

// ---------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------

export type RuleSetView = {
  id: string;
  version: number;
  /** First day of the month this version starts, "2026-12-01". */
  effectiveFromMonth: string;
  rules: TierRules;
  tiers: { key: TierKey; name: string; thresholdCents: number; benefits: string | null }[];
  names: Record<TierKey, string>;
  createdAt: string;
  createdBy: string | null;
};

/** A rule set as JSON. The portal's copy leaves out who saved it. */
export type RuleSetInput = Omit<TierRuleSetJson, "created_by"> & { created_by?: string | null };

export function toRuleSetView(json: RuleSetInput): RuleSetView {
  const byKey = new Map(json.tiers.map((t) => [t.tier_key, t]));
  const threshold = (key: "silver" | "gold" | "diamond") => byKey.get(key)?.threshold_cents ?? 0;
  const tiers = TIER_ORDER.map((key) => ({
    key,
    name: byKey.get(key)?.display_name ?? key,
    thresholdCents: key === "base" ? 0 : threshold(key),
    benefits: byKey.get(key)?.benefits_text ?? null,
  }));
  return {
    id: json.id,
    version: json.version,
    effectiveFromMonth: json.effective_from_month,
    rules: {
      visitValueCents: json.visit_value_cents,
      lookbackMonths: json.lookback_months,
      method: json.lookback_method,
      carryOver: json.carry_over_enabled,
      requirePurchase: json.require_purchase,
      requireVisit: json.require_visit,
      thresholds: { silver: threshold("silver"), gold: threshold("gold"), diamond: threshold("diamond") },
    },
    tiers,
    names: Object.fromEntries(tiers.map((t) => [t.key, t.name])) as Record<TierKey, string>,
    createdAt: json.created_at,
    createdBy: json.created_by ?? null,
  };
}

export type RulesOverview = {
  /** First day of the current New York month and of the next one. */
  month: string;
  nextMonth: string;
  /** In use this month. */
  current: RuleSetView;
  /** Will be in use next month (the same as `current` unless the Owner saved changes). */
  next: RuleSetView;
  history: RuleSetView[];
};

export const getRulesOverview = cache(async (): Promise<RulesOverview> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("tier_rules_overview");
  if (error || !data) throw new Error("Couldn't load the tier rules");
  const overview = data as TierRulesOverview;
  return {
    month: overview.month,
    nextMonth: overview.next_month,
    current: toRuleSetView(overview.current),
    next: toRuleSetView(overview.next),
    history: overview.history.map(toRuleSetView),
  };
});

/** Tier names in use this month (what staff see on badges today). */
export async function getTierLabels(): Promise<Record<TierKey, string>> {
  return (await getRulesOverview()).current.names;
}

// ---------------------------------------------------------------------------------------
// A customer's tier
// ---------------------------------------------------------------------------------------

export type OverrideView = {
  tier: TierKey;
  reason: string;
  /** Last month the override applies ("2026-12-01"), or null when it lasts until removed. */
  lastMonth: string | null;
  createdAt: string;
};

function toOverrideView(row: TierOverrideRow): OverrideView {
  return { tier: row.tier_key, reason: row.reason, lastMonth: row.last_month, createdAt: row.created_at };
}

export async function getOverride(customerId: string): Promise<OverrideView | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("customer_tier_override", { p_customer_id: customerId });
  const row = data?.[0];
  return row ? toOverrideView(row) : null;
}

export type CurrentTier = {
  key: TierKey;
  label: string;
  override: OverrideView | null;
  /** Where the tier comes from: the Owner's override, this month's award, or the starting tier. */
  source: "override" | "award" | "start";
};

/** The tier a customer holds right now: an Owner override, else this month's award, else Base. */
export async function getCurrentTier(customerId: string): Promise<CurrentTier> {
  const supabase = await createSupabaseServerClient();
  const overview = await getRulesOverview();
  const [override, awardRes] = await Promise.all([
    getOverride(customerId),
    supabase
      .from("monthly_tier_awards")
      .select("tier_key")
      .eq("customer_id", customerId)
      .eq("awarded_month", overview.month)
      .eq("is_current", true)
      .maybeSingle(),
  ]);
  const awarded = awardRes.data?.tier_key ?? null;
  const key: TierKey = override?.tier ?? awarded ?? "base";
  return {
    key,
    label: overview.current.names[key],
    override,
    source: override ? "override" : awarded ? "award" : "start",
  };
}

export type TierView = {
  current: CurrentTier;
  /** "If this month ended now" (§7.5), using the rules that apply next month. */
  projection: {
    tier: TierKey;
    label: string;
    /** First day of the month the projected tier would apply to. */
    forMonth: string;
    scoreCents: number;
    months: (MonthActivity & { month: string })[];
    thisMonth: { spendCents: number; visits: number; pointsCents: number };
    rules: TierRules;
    ruleVersion: number;
    names: Record<TierKey, string>;
    thresholds: { key: TierKey; name: string; thresholdCents: number }[];
    progress: Progress;
  };
};

export type ProjectionView = TierView["projection"];

/** Turns the database's projection JSON into what the screens use (shared by staff and the portal). */
export function toProjectionView(json: Omit<TierProjectionJson, "rules"> & { rules: RuleSetInput }): ProjectionView {
  const rules = toRuleSetView(json.rules);
  const months = json.months.map((m) => ({ month: m.month, spendCents: m.spend_cents, visits: m.visits }));
  const thisMonth = months[months.length - 1] ?? { spendCents: 0, visits: 0 };
  return {
    tier: json.projected.tier_key,
    label: rules.names[json.projected.tier_key],
    forMonth: json.next_month,
    scoreCents: json.projected.score_cents,
    months,
    thisMonth: {
      spendCents: thisMonth.spendCents,
      visits: thisMonth.visits,
      pointsCents: monthPoints(thisMonth, rules.rules.visitValueCents),
    },
    rules: rules.rules,
    ruleVersion: rules.version,
    names: rules.names,
    thresholds: rules.tiers.map((t) => ({ key: t.key, name: t.name, thresholdCents: t.thresholdCents })),
    progress: progressToNextTier(months, rules.rules, json.carry_in_cents),
  };
}

export async function getCustomerTierView(customerId: string): Promise<TierView> {
  const supabase = await createSupabaseServerClient();
  const [current, projectionRes] = await Promise.all([
    getCurrentTier(customerId),
    supabase.rpc("tier_projection", { p_customer_id: customerId }),
  ]);
  if (projectionRes.error || !projectionRes.data) throw new Error("Couldn't load the tier projection");
  return { current, projection: toProjectionView(projectionRes.data) };
}
