import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TierKey } from "@/lib/tier/engine";
import type { AwardSource, MonthlyTierAwardRow, RolloverRunRow } from "@/types/database";
import { getRulesOverview } from "./tiers";

// ---------------------------------------------------------------------------------------
// A member's monthly tier history
// ---------------------------------------------------------------------------------------

export type AwardView = {
  id: string;
  /** First day of the month the tier applies to, "2026-12-01". */
  awardedMonth: string;
  /** First day of the month that decided it. */
  qualifyingMonth: string;
  tier: TierKey;
  /** The tier's name as it was called when it was decided. */
  label: string;
  netSpendCents: number;
  visits: number;
  scoreCents: number;
  requirementsMet: boolean;
  isCurrent: boolean;
  isTest: boolean;
  source: AwardSource;
  reason: string | null;
  calculatedAt: string;
  ruleVersion: number | null;
  lookbackMonths: number;
  method: "average" | "every_month";
  months: { month: string; spendCents: number; visits: number }[];
};

/** Newest first. Replaced results are included (marked `isCurrent: false`) so the full story stays visible. */
export async function getAwardHistory(customerId: string, limit = 60): Promise<AwardView[]> {
  const supabase = await createSupabaseServerClient();
  const [res, overview] = await Promise.all([
    supabase
      .from("monthly_tier_awards")
      .select("*")
      .eq("customer_id", customerId)
      .order("awarded_month", { ascending: false })
      .order("calculated_at", { ascending: false })
      .limit(limit),
    getRulesOverview(),
  ]);
  if (res.error) throw new Error("Couldn't load the monthly tiers");

  const versions = new Map(overview.history.map((v) => [v.id, v]));
  return (res.data ?? []).map((row: MonthlyTierAwardRow) => {
    const rules = versions.get(row.rule_set_id) ?? overview.current;
    return {
      id: row.id,
      awardedMonth: row.awarded_month,
      qualifyingMonth: row.qualifying_month,
      tier: row.tier_key,
      label: rules.names[row.tier_key],
      netSpendCents: row.net_spend_cents,
      visits: row.qualifying_visits,
      scoreCents: row.score_cents,
      requirementsMet: row.requirements_met,
      isCurrent: row.is_current,
      isTest: row.is_test,
      source: row.source,
      reason: row.reason,
      calculatedAt: row.calculated_at,
      ruleVersion: versions.get(row.rule_set_id)?.version ?? null,
      lookbackMonths: row.evidence?.lookback_months ?? 1,
      method: row.evidence?.method ?? "average",
      months: (row.evidence?.months ?? []).map((m) => ({ month: m.month, spendCents: m.spend_cents, visits: m.visits })),
    };
  });
}

// ---------------------------------------------------------------------------------------
// The monthly update itself (Owner)
// ---------------------------------------------------------------------------------------

export type RunView = {
  id: string;
  awardedMonth: string;
  source: RolloverRunRow["source"];
  status: RolloverRunRow["status"];
  processed: number;
  skipped: number;
  summary: Partial<Record<TierKey, number>> | null;
  error: string | null;
  startedAt: string;
  startedByName: string | null;
};

export type UpdateState =
  /** This month's real update has finished. */
  | { kind: "done"; run: RunView }
  /** The last attempt failed and nothing has succeeded since. The hourly check will try again. */
  | { kind: "failed"; run: RunView }
  /** Not done yet — normally only in the first minutes of a month, or right after set-up. */
  | { kind: "pending" };

export type RolloverOverview = {
  month: string;
  nextMonth: string;
  state: UpdateState;
  /** The most recent real update that finished, from any month. */
  lastSuccess: RunView | null;
  runs: RunView[];
  testToolsEnabled: boolean;
};

function toRunView(row: RolloverRunRow, names: Map<string, string>): RunView {
  return {
    id: row.id,
    awardedMonth: row.awarded_month,
    source: row.source,
    status: row.status,
    processed: row.customers_processed,
    skipped: row.customers_skipped,
    summary: row.summary,
    error: row.error,
    startedAt: row.started_at,
    startedByName: row.started_by ? (names.get(row.started_by) ?? null) : null,
  };
}

function stateFor(month: string, runs: RunView[]): UpdateState {
  const thisMonth = runs.filter((r) => r.source !== "test" && r.awardedMonth === month);
  // The run that did the work (a later "check again" run decides nobody new).
  const done = thisMonth.filter((r) => r.status === "succeeded").sort((x, y) => y.processed - x.processed)[0];
  if (done) return { kind: "done", run: done };
  const failed = thisMonth.find((r) => r.status === "failed");
  return failed ? { kind: "failed", run: failed } : { kind: "pending" };
}

export async function getRolloverOverview(): Promise<RolloverOverview> {
  const supabase = await createSupabaseServerClient();
  const [overview, runsRes, employeesRes, settingRes] = await Promise.all([
    getRulesOverview(),
    supabase.from("tier_rollover_runs").select("*").order("started_at", { ascending: false }).limit(25),
    supabase.from("employees").select("id, first_name, last_name"),
    supabase.from("app_settings").select("value").eq("key", "test_tools_enabled").maybeSingle(),
  ]);
  if (runsRes.error) throw new Error("Couldn't load the monthly updates");

  const names = new Map((employeesRes.data ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]));
  const runs = (runsRes.data ?? []).map((r) => toRunView(r, names));
  return {
    month: overview.month,
    nextMonth: overview.nextMonth,
    state: stateFor(overview.month, runs),
    lastSuccess: runs.find((r) => r.source !== "test" && r.status === "succeeded") ?? null,
    runs,
    testToolsEnabled: settingRes.data?.value === true,
  };
}

/** Cheap check for the dashboard: did this month's update fail? (Owner only — others can't read runs.) */
export async function getRolloverFailure(): Promise<RunView | null> {
  const supabase = await createSupabaseServerClient();
  const overview = await getRulesOverview();
  const { data } = await supabase
    .from("tier_rollover_runs")
    .select("*")
    .eq("awarded_month", overview.month)
    .neq("source", "test")
    .order("started_at", { ascending: false })
    .limit(10);
  const runs = (data ?? []).map((r) => toRunView(r, new Map()));
  const state = stateFor(overview.month, runs);
  return state.kind === "failed" ? state.run : null;
}

/** True on a test site where the Owner's test tools are switched on (off by default; see §9.5). */
export async function isTestToolsEnabled(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "test_tools_enabled").maybeSingle();
  return data?.value === true;
}
