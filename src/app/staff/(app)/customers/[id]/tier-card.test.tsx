import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TierRules } from "@/lib/tier/engine";
import { progressToNextTier } from "@/lib/tier/engine";
import type { AwardView } from "@/server/tier-awards";
import type { TierView } from "@/server/tiers";
import { TierCard } from "./tier-card";

// The Owner dialogs call server actions; they aren't exercised when only rendering.
vi.mock("@/server/actions/tiers", () => ({ setTierOverrideAction: vi.fn(), clearTierOverrideAction: vi.fn() }));

const RULES: TierRules = {
  visitValueCents: 0,
  lookbackMonths: 1,
  method: "average",
  carryOver: false,
  requirePurchase: true,
  requireVisit: true,
  thresholds: { silver: 30000, gold: 60000, diamond: 100000 },
};
const NAMES = { base: "Base", silver: "Silver", gold: "Gold", diamond: "Diamond" } as const;

function view(options: {
  spendCents?: number;
  visits?: number;
  projected?: "base" | "silver" | "gold" | "diamond";
  override?: TierView["current"]["override"];
  rules?: TierRules;
  months?: { spendCents: number; visits: number }[];
}): TierView {
  const rules = options.rules ?? RULES;
  const months = options.months ?? [{ spendCents: options.spendCents ?? 0, visits: options.visits ?? 0 }];
  const last = months[months.length - 1];
  return {
    current: {
      key: options.override?.tier ?? "base",
      label: NAMES[options.override?.tier ?? "base"],
      override: options.override ?? null,
      source: options.override ? "override" : "start",
    },
    projection: {
      tier: options.projected ?? "base",
      label: NAMES[options.projected ?? "base"],
      forMonth: "2026-12-01",
      scoreCents: last.spendCents,
      months: months.map((m, i) => ({ ...m, month: `2026-${String(11 - months.length + 1 + i).padStart(2, "0")}-01` })),
      thisMonth: { spendCents: last.spendCents, visits: last.visits, pointsCents: last.spendCents + last.visits * rules.visitValueCents },
      rules,
      ruleVersion: 1,
      names: { ...NAMES },
      thresholds: [
        { key: "base", name: "Base", thresholdCents: 0 },
        { key: "silver", name: "Silver", thresholdCents: rules.thresholds.silver },
        { key: "gold", name: "Gold", thresholdCents: rules.thresholds.gold },
        { key: "diamond", name: "Diamond", thresholdCents: rules.thresholds.diamond },
      ],
      progress: progressToNextTier(months, rules),
    },
  };
}

const MONTHS = [
  { value: "2026-11-01", label: "November 2026 (this month)" },
  { value: "2026-12-01", label: "December 2026" },
];

const award = (overrides: Partial<AwardView> = {}): AwardView => ({
  id: "a1",
  awardedMonth: "2026-11-01",
  qualifyingMonth: "2026-10-01",
  tier: "silver",
  label: "Silver",
  netSpendCents: 35000,
  visits: 1,
  scoreCents: 35000,
  requirementsMet: true,
  isCurrent: true,
  isTest: false,
  source: "scheduled",
  reason: null,
  calculatedAt: "2026-11-01T05:05:00Z",
  ruleVersion: 1,
  lookbackMonths: 1,
  method: "average",
  months: [{ month: "2026-10-01", spendCents: 35000, visits: 1 }],
  ...overrides,
});

const render = (v: TierView, canManage = false, awards: AwardView[] = []) =>
  renderToStaticMarkup(
    <TierCard
      view={v}
      awards={awards}
      customerId="7a2d3c0f-5e3b-4d9f-8c2b-3a4f5e6d7c8b"
      customerName="Test One"
      canManage={canManage}
      monthOptions={MONTHS}
    />,
  );

describe("TierCard", () => {
  it("labels the current and projected tiers separately", () => {
    const html = render(view({ spendCents: 18000, visits: 1 }));
    expect(html).toContain("Current tier");
    expect(html).toContain("Projected for December 2026");
    expect(html).toContain("What they&#x27;d get if this month ended today.");
  });

  it("shows progress and the easiest way up", () => {
    const html = render(view({ spendCents: 18000, visits: 1 }));
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("$180.00 of $300.00 points");
    expect(html).toContain("spend $120.00 more");
  });

  it("explains missing requirements", () => {
    expect(render(view({ spendCents: 0, visits: 0 }))).toContain("Still needed this month: a purchase and a visit");
    expect(render(view({ spendCents: 50000, visits: 0 }))).toContain("Still needed this month: a visit");
  });

  it("says when the points already reach a tier but a requirement holds it back", () => {
    const html = render(view({ spendCents: 70000, visits: 0 }));
    expect(html).toContain("Their points already reach Gold");
  });

  it("congratulates a member at the top tier", () => {
    const html = render(view({ spendCents: 150000, visits: 2, projected: "diamond" }));
    expect(html).toContain("Top tier");
    expect(html).not.toContain('role="progressbar"');
  });

  it("shows an Owner override with its reason and end month", () => {
    const html = render(
      view({ override: { tier: "gold", reason: "Long-time VIP", lastMonth: "2027-01-01", createdAt: "2026-11-01T00:00:00Z" } }),
    );
    expect(html).toContain("Set by the Owner until the end of January 2027");
    expect(html).toContain("Long-time VIP");
    expect(html).toContain("Your override above stays in effect");
  });

  it("says an override lasts until removed when it has no end month", () => {
    const html = render(view({ override: { tier: "silver", reason: "Promo", lastMonth: null, createdAt: "2026-11-01T00:00:00Z" } }));
    expect(html).toContain("until the Owner removes it");
  });

  it("only offers the override buttons to the Owner", () => {
    const withOverride = view({ override: { tier: "gold", reason: "VIP", lastMonth: null, createdAt: "2026-11-01T00:00:00Z" } });
    const owner = render(withOverride, true);
    expect(owner).toContain("Change tier");
    expect(owner).toContain("Remove override");
    expect(owner).toContain("Tier settings");

    const staff = render(withOverride, false);
    expect(staff).not.toContain("Change tier");
    expect(staff).not.toContain("Remove override");
    expect(render(view({}), true)).toContain("Set tier by hand");
  });

  it("uses the configured tier names", () => {
    const renamed = view({ spendCents: 18000, visits: 1 });
    renamed.projection.names.silver = "Bronze";
    renamed.projection.progress = { ...renamed.projection.progress };
    expect(render(renamed)).toContain("Bronze");
  });

  it("handles an every-month look-back that is blocked by an earlier month", () => {
    const rules: TierRules = { ...RULES, lookbackMonths: 2, method: "every_month" };
    const html = render(view({ rules, months: [{ spendCents: 10000, visits: 1 }, { spendCents: 0, visits: 1 }] }));
    expect(html).toContain("too low to reach Silver this month");
  });

  it("says where the current tier came from when it was decided automatically", () => {
    const html = render(view({}), false, [award({ awardedMonth: "2026-11-01", qualifyingMonth: "2026-10-01" })]);
    expect(html).toContain("Decided from October 2026.");
  });

  it("marks a test run", () => {
    const html = render(view({}), false, [award({ isTest: true })]);
    expect(html).toContain("Decided from October 2026 (test run).");
  });

  it("shows when next month is already decided", () => {
    const html = render(view({}), false, [award({ awardedMonth: "2026-12-01", qualifyingMonth: "2026-11-01", tier: "gold", label: "Gold" })]);
    expect(html).toContain("Already decided: Gold, starting Dec 1, 2026.");
  });

  it("ignores replaced awards when saying what is decided", () => {
    const html = render(view({}), false, [award({ awardedMonth: "2026-12-01", tier: "gold", label: "Gold", isCurrent: false })]);
    expect(html).not.toContain("Already decided");
  });

  it("shows this month's numbers", () => {
    const html = render(view({ spendCents: 12345, visits: 3 }));
    expect(html).toContain("$123.45");
    expect(html).toContain("Visit days");
  });
});
