/**
 * The tier calculation (PROJECT_SCOPE.md §7.3) — TypeScript twin of the database function
 * app_private.calc_tier. Keep the two IDENTICAL: scripts/run-db-tests.mjs runs hundreds of
 * random cases through both and fails if they ever disagree.
 *
 * Pure functions, integer cents only, no imports (so Node can load this file directly).
 */

export type TierKey = "base" | "silver" | "gold" | "diamond";
export type LookbackMethod = "average" | "every_month";

export const TIER_ORDER: readonly TierKey[] = ["base", "silver", "gold", "diamond"];

export type TierRules = {
  /** Value of one qualifying visit, in cents. $0 means visits don't count. */
  visitValueCents: number;
  /** How many months are looked at (the last N months, ending with the month being decided). */
  lookbackMonths: number;
  method: LookbackMethod;
  carryOver: boolean;
  requirePurchase: boolean;
  requireVisit: boolean;
  /** Points needed for each tier above Base, in cents. Strictly increasing. */
  thresholds: { silver: number; gold: number; diamond: number };
};

/** One month of activity. Net spend = purchases − refunds ± counted adjustments. */
export type MonthActivity = { spendCents: number; visits: number };

export type TierResult = {
  tier: TierKey;
  /** The number compared with the thresholds (average, weakest month, or available balance). */
  scoreCents: number;
  /** Credit carried into next month (carry-over only; otherwise 0). */
  carryOutCents: number;
  /** False when a "require a purchase / visit" setting kept the customer at Base. */
  requirementsMet: boolean;
};

export function monthPoints(month: MonthActivity, visitValueCents: number): number {
  return month.spendCents + month.visits * visitValueCents;
}

/** The highest tier whose threshold the score reaches (Base if none; Base has no threshold). */
export function tierForScore(scoreCents: number, thresholds: TierRules["thresholds"]): TierKey {
  if (scoreCents >= thresholds.diamond) return "diamond";
  if (scoreCents >= thresholds.gold) return "gold";
  if (scoreCents >= thresholds.silver) return "silver";
  return "base";
}

export function thresholdOf(tier: TierKey, thresholds: TierRules["thresholds"]): number {
  return tier === "base" ? 0 : thresholds[tier];
}

/**
 * `months` is oldest first, newest last, one entry per month in the window (length = lookbackMonths).
 * `carryInCents` is only used when carry-over is on.
 */
export function calculateTier(months: MonthActivity[], rules: TierRules, carryInCents = 0): TierResult {
  const n = months.length;
  if (n === 0) throw new RangeError("calculateTier needs at least one month");

  const points = months.map((m) => monthPoints(m, rules.visitValueCents));
  const totalPoints = points.reduce((a, b) => a + b, 0);
  const totalSpend = months.reduce((a, m) => a + m.spendCents, 0);
  const totalVisits = months.reduce((a, m) => a + m.visits, 0);
  const last = months[n - 1];

  let score: number;
  let requirementsMet: boolean;

  if (rules.carryOver) {
    // One-month window: the month just ended, plus whatever carried in.
    score = points[n - 1] + carryInCents;
    // Carried credit was already earned through real purchases, so requirements apply only to new credit.
    requirementsMet =
      carryInCents > 0 || ((!rules.requirePurchase || last.spendCents > 0) && (!rules.requireVisit || last.visits >= 1));
  } else if (rules.method === "average") {
    score = Math.floor(totalPoints / n);
    requirementsMet = (!rules.requirePurchase || totalSpend > 0) && (!rules.requireVisit || totalVisits >= 1);
  } else {
    // Every month must reach the tier on its own: the weakest month decides.
    score = Math.min(...points);
    requirementsMet = months.every(
      (m) => (!rules.requirePurchase || m.spendCents > 0) && (!rules.requireVisit || m.visits >= 1),
    );
  }

  const tier = requirementsMet ? tierForScore(score, rules.thresholds) : "base";

  let carryOutCents = 0;
  if (rules.carryOver) {
    // Leftover credit carries forward. A month that failed the requirements earns no new credit,
    // but a negative balance (refunds) is never forgotten.
    carryOutCents = requirementsMet ? score - thresholdOf(tier, rules.thresholds) : Math.min(score, 0);
  }

  return { tier, scoreCents: score, carryOutCents, requirementsMet };
}

// ---------------------------------------------------------------------------------------
// "What's the easiest way up?" (§7.5) — display help only; the tier itself comes from the
// calculation above (the database is the source of truth for awards).
// ---------------------------------------------------------------------------------------

export type Blocker = "purchase" | "visit";

export type Progress = {
  /** The next tier up from the one the customer's points qualify for. Null at the top. */
  nextTier: TierKey | null;
  /** The score the next tier needs. */
  targetCents: number | null;
  scoreCents: number;
  /** Extra points still needed THIS month. Null when it can't be reached this month. */
  missingCents: number | null;
  /** The same gap in qualifying visits (one per day), when visits are worth money. */
  extraVisits: number | null;
  /** True when earlier months in an "every month" window are too weak to reach the next tier. */
  blockedByEarlierMonths: boolean;
  /** Requirements this month still needs, for example "make a purchase". */
  blockers: Blocker[];
  /** The tier the points alone qualify for, before the requirements. */
  scoreTier: TierKey;
};

export function progressToNextTier(months: MonthActivity[], rules: TierRules, carryInCents = 0): Progress {
  const result = calculateTier(months, rules, carryInCents);
  const current = months[months.length - 1];
  const points = months.map((m) => monthPoints(m, rules.visitValueCents));
  const scoreTier = tierForScore(result.scoreCents, rules.thresholds);
  const nextIndex = TIER_ORDER.indexOf(scoreTier) + 1;
  const nextTier = nextIndex < TIER_ORDER.length ? TIER_ORDER[nextIndex] : null;

  const blockers: Blocker[] = [];
  const carried = rules.carryOver && carryInCents > 0;
  if (!carried) {
    if (rules.requirePurchase && current.spendCents <= 0 && (rules.carryOver || rules.method === "every_month" || months.reduce((a, m) => a + m.spendCents, 0) <= 0)) {
      blockers.push("purchase");
    }
    if (rules.requireVisit && current.visits < 1 && (rules.carryOver || rules.method === "every_month" || months.reduce((a, m) => a + m.visits, 0) < 1)) {
      blockers.push("visit");
    }
  }

  let targetCents: number | null = null;
  let missingCents: number | null = null;
  let blockedByEarlierMonths = false;

  if (nextTier) {
    targetCents = thresholdOf(nextTier, rules.thresholds);
    const n = months.length;
    if (rules.carryOver) {
      missingCents = Math.max(0, targetCents - result.scoreCents);
    } else if (rules.method === "average") {
      // floor((sum + x) / n) >= target  <=>  sum + x >= target * n
      missingCents = Math.max(0, targetCents * n - points.reduce((a, b) => a + b, 0));
    } else {
      blockedByEarlierMonths = points.slice(0, -1).some((p) => p < targetCents!);
      missingCents = blockedByEarlierMonths ? null : Math.max(0, targetCents - points[n - 1]);
    }
  }

  const extraVisits =
    missingCents !== null && rules.visitValueCents > 0 ? Math.ceil(missingCents / rules.visitValueCents) : null;

  return {
    nextTier,
    targetCents,
    scoreCents: result.scoreCents,
    missingCents,
    extraVisits,
    blockedByEarlierMonths,
    blockers,
    scoreTier,
  };
}
