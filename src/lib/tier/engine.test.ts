import { describe, expect, it } from "vitest";
import {
  type MonthActivity,
  type TierRules,
  calculateTier,
  monthPoints,
  progressToNextTier,
  tierForScore,
} from "./engine";

/** Launch defaults: Silver $300, Gold $600, Diamond $1,000; visits worth $0; last month only. */
const DEFAULTS: TierRules = {
  visitValueCents: 0,
  lookbackMonths: 1,
  method: "average",
  carryOver: false,
  requirePurchase: true,
  requireVisit: true,
  thresholds: { silver: 30000, gold: 60000, diamond: 100000 },
};
const rules = (overrides: Partial<TierRules> = {}): TierRules => ({ ...DEFAULTS, ...overrides });
const month = (spendCents: number, visits = 1): MonthActivity => ({ spendCents, visits });
const tier = (months: MonthActivity[], r: TierRules = DEFAULTS, carryIn = 0) => calculateTier(months, r, carryIn).tier;

describe("thresholds: exactly at the limit and one cent below", () => {
  it.each([
    [30000, "silver"],
    [29999, "base"],
    [60000, "gold"],
    [59999, "silver"],
    [100000, "diamond"],
    [99999, "gold"],
  ])("$%s of spend with 1 visit → %s", (spend, expected) => {
    expect(tier([month(spend)])).toBe(expected);
  });

  it("the highest eligible tier wins", () => {
    expect(tier([month(500000)])).toBe("diamond");
  });

  it("tierForScore handles zero and negative scores", () => {
    expect(tierForScore(0, DEFAULTS.thresholds)).toBe("base");
    expect(tierForScore(-5000, DEFAULTS.thresholds)).toBe("base");
  });
});

describe("visit value", () => {
  it("$0 per visit: visits don't change the score", () => {
    expect(calculateTier([month(29000, 20)], DEFAULTS).scoreCents).toBe(29000);
    expect(tier([month(29000, 20)])).toBe("base");
  });

  it("$20 per visit: visits add to the score", () => {
    const r = rules({ visitValueCents: 2000 });
    // 5 visits × $20 = $100, plus $520 spent = $620 → Gold
    expect(calculateTier([month(52000, 5)], r).scoreCents).toBe(62000);
    expect(tier([month(52000, 5)], r)).toBe("gold");
    expect(monthPoints(month(52000, 5), 2000)).toBe(62000);
  });

  it("visit value lets a smaller spend reach the tier", () => {
    const r = rules({ visitValueCents: 2000 });
    expect(tier([month(28000, 1)], r)).toBe("silver"); // 280 + 20 = 300
    expect(tier([month(27999, 1)], r)).toBe("base");
  });
});

describe("requirements", () => {
  it("visits alone never qualify when a purchase is required", () => {
    const r = rules({ visitValueCents: 50000 });
    expect(tier([month(0, 5)], r)).toBe("base");
    expect(calculateTier([month(0, 5)], r).requirementsMet).toBe(false);
  });

  it("spend alone doesn't qualify when a visit is required", () => {
    expect(tier([month(500000, 0)])).toBe("base");
  });

  it("with both requirements off, points alone decide", () => {
    const r = rules({ requirePurchase: false, requireVisit: false, visitValueCents: 50000 });
    expect(tier([month(0, 1)], r)).toBe("silver"); // 1 visit worth $500 = 50000, Silver needs 30000, Gold 60000
    expect(tier([month(500000, 0)], r)).toBe("diamond");
  });

  it("a refund can pull the score below a threshold", () => {
    expect(tier([month(100000)])).toBe("diamond");
    expect(tier([month(100000 - 1)])).toBe("gold");
    expect(tier([month(-20000)])).toBe("base");
  });
});

describe("look-back over several months", () => {
  const three = rules({ lookbackMonths: 3 });

  it('"Average": the average of the months must reach the tier', () => {
    // (0 + 30000 + 60000) / 3 = 30000 → Silver
    expect(tier([month(0, 1), month(30000), month(60000)], three)).toBe("silver");
    // (0 + 30000 + 59999) / 3 = 29999.67 → floor 29999 → Base
    expect(tier([month(0, 1), month(30000), month(59999)], three)).toBe("base");
  });

  it('"Average": a big month carries a weak one', () => {
    // (100 + 100 + 700) / 3 = $300 → Silver, even though two of the months were tiny
    expect(tier([month(10000), month(10000), month(70000)], three)).toBe("silver");
  });

  it('"Every month": the weakest month decides', () => {
    const every = rules({ lookbackMonths: 3, method: "every_month" });
    expect(tier([month(30000), month(60000), month(100000)], every)).toBe("silver");
    expect(tier([month(60000), month(60000), month(60000)], every)).toBe("gold");
    expect(tier([month(60000), month(60000), month(29999)], every)).toBe("base");
  });

  it('"Every month": a month with no purchase fails the requirement', () => {
    const every = rules({ lookbackMonths: 2, method: "every_month" });
    expect(tier([month(0, 3), month(500000)], every)).toBe("base");
  });

  it('"Average": requirements look at the whole window', () => {
    // No visit in the window at all → Base even with lots of spend.
    expect(tier([month(500000, 0), month(500000, 0), month(500000, 0)], three)).toBe("base");
    // One visit anywhere in the window is enough.
    expect(tier([month(500000, 0), month(500000, 1), month(500000, 0)], three)).toBe("diamond");
  });

  it("months before the customer joined count as 0", () => {
    // Joined this month: (0 + 0 + 90000) / 3 = 30000 → Silver
    expect(tier([month(0, 0), month(0, 0), month(90000)], three)).toBe("silver");
  });

  it("the average floors, never rounds up", () => {
    const r = rules({ lookbackMonths: 2 });
    expect(calculateTier([month(30000), month(30001)], r).scoreCents).toBe(30000);
    expect(calculateTier([month(-1), month(0, 1)], r).scoreCents).toBe(-1); // floor(-0.5) = -1
  });
});

describe("carry-over", () => {
  // Diamond needs $5,000 a month for this scenario.
  const carry = rules({ carryOver: true, thresholds: { silver: 100000, gold: 300000, diamond: 500000 } });

  it("$50,000 at a $5,000 threshold gives 10 months of Diamond", () => {
    let balance = 0;
    const results: string[] = [];
    // Month 1: spends $50,000 and visits once. Months 2–11: nothing at all.
    for (let m = 1; m <= 11; m++) {
      const r = calculateTier([m === 1 ? month(5_000_000, 1) : month(0, 0)], carry, balance);
      results.push(r.tier);
      balance = r.carryOutCents;
    }
    expect(results.slice(0, 10)).toEqual(Array(10).fill("diamond"));
    expect(results[10]).toBe("base");
    expect(balance).toBe(0);
  });

  it("$7,000 earns Diamond and carries $2,000 forward", () => {
    const r = calculateTier([month(700000, 1)], carry, 0);
    expect(r.tier).toBe("diamond");
    expect(r.carryOutCents).toBe(200000);
  });

  it("the carried $2,000 plus a $3,000 month is Diamond again", () => {
    expect(tier([month(300000, 1)], carry, 200000)).toBe("diamond");
  });

  it("the carried $2,000 alone, with no activity, is Silver", () => {
    const r = calculateTier([month(0, 0)], carry, 200000);
    expect(r.tier).toBe("silver");
    expect(r.carryOutCents).toBe(100000);
  });

  it("a month that fails the requirements earns no new credit", () => {
    const visitsOnly = rules({ carryOver: true, visitValueCents: 50000 });
    const r = calculateTier([month(0, 4)], visitsOnly, 0);
    expect(r.tier).toBe("base");
    expect(r.requirementsMet).toBe(false);
    expect(r.carryOutCents).toBe(0); // the $2,000 of visit value is not banked
  });

  it("refunds create a debt that is carried and paid back", () => {
    const first = calculateTier([month(-200000, 1)], carry, 0);
    expect(first.tier).toBe("base");
    expect(first.carryOutCents).toBe(-200000);
    // Next month: spends $3,000 against the $2,000 debt → $1,000 available → Silver.
    const second = calculateTier([month(300000, 1)], carry, first.carryOutCents);
    expect(second.scoreCents).toBe(100000);
    expect(second.tier).toBe("silver");
    expect(second.carryOutCents).toBe(0);
  });

  it("negative carry never raises a tier", () => {
    expect(tier([month(600000, 1)], carry, -200000)).toBe("gold"); // 6000 − 2000 = 4000 → Gold
  });
});

describe("progress to the next tier", () => {
  it("says how much more to spend, and how many visits that is", () => {
    const r = rules({ visitValueCents: 2000 });
    const p = progressToNextTier([month(28000, 1)], r); // score 300? 28000 + 2000 = 30000 → Silver
    expect(p.scoreTier).toBe("silver");
    expect(p.nextTier).toBe("gold");
    expect(p.missingCents).toBe(30000);
    expect(p.extraVisits).toBe(15);
  });

  it("from Base: points still needed for Silver", () => {
    const p = progressToNextTier([month(18000, 1)], DEFAULTS);
    expect(p.nextTier).toBe("silver");
    expect(p.missingCents).toBe(12000);
    expect(p.extraVisits).toBeNull(); // visits are worth $0
    expect(p.blockers).toEqual([]);
  });

  it("names the requirements still missing", () => {
    expect(progressToNextTier([month(0, 3)], DEFAULTS).blockers).toEqual(["purchase"]);
    expect(progressToNextTier([month(50000, 0)], DEFAULTS).blockers).toEqual(["visit"]);
    expect(progressToNextTier([month(0, 0)], DEFAULTS).blockers).toEqual(["purchase", "visit"]);
  });

  it("is null at the top tier", () => {
    const p = progressToNextTier([month(500000, 1)], DEFAULTS);
    expect(p.nextTier).toBeNull();
    expect(p.missingCents).toBeNull();
  });

  it('"Average": the gap accounts for the other months', () => {
    const r = rules({ lookbackMonths: 3 });
    // points 0 + 30000 + 0 = 30000; Silver needs 30000 × 3 = 90000 → 60000 more this month
    const p = progressToNextTier([month(0, 0), month(30000), month(0, 1)], r);
    expect(p.missingCents).toBe(60000);
  });

  it('"Every month": earlier weak months block the next tier this month', () => {
    const r = rules({ lookbackMonths: 2, method: "every_month" });
    const p = progressToNextTier([month(10000), month(0, 1)], r);
    expect(p.blockedByEarlierMonths).toBe(true);
    expect(p.missingCents).toBeNull();
  });

  it("matches the calculation: spending exactly the gap reaches the next tier", () => {
    const r = rules({ visitValueCents: 1000, lookbackMonths: 1 });
    const start = month(21000, 2);
    const p = progressToNextTier([start], r);
    expect(p.nextTier).toBe("silver"); // 21000 + 2000 = 23000 → Base, next Silver
    const reached = { ...start, spendCents: start.spendCents + p.missingCents! };
    expect(tier([reached], r)).toBe("silver");
    const justShort = { ...start, spendCents: start.spendCents + p.missingCents! - 1 };
    expect(tier([justShort], r)).toBe("base");
  });
});
