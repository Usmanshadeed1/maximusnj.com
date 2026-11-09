import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AwardView } from "@/server/tier-awards";
import { MonthlyTiersCard } from "./monthly-tiers-card";

vi.mock("@/server/actions/tier-awards", () => ({ recalculateAction: vi.fn() }));

const award = (overrides: Partial<AwardView> = {}): AwardView => ({
  id: "a1",
  awardedMonth: "2026-12-01",
  qualifyingMonth: "2026-11-01",
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
  calculatedAt: "2026-12-01T05:05:00Z",
  ruleVersion: 1,
  lookbackMonths: 1,
  method: "average",
  months: [{ month: "2026-11-01", spendCents: 35000, visits: 1 }],
  ...overrides,
});

const MONTHS = [{ value: "2026-12-01", label: "December 2026 (this month)" }];
const render = (awards: AwardView[], canManage = false) =>
  renderToStaticMarkup(
    <MonthlyTiersCard awards={awards} customerId="7a2d3c0f-5e3b-4d9f-8c2b-3a4f5e6d7c8b" customerName="Test One" canManage={canManage} monthOptions={MONTHS} />,
  );

describe("MonthlyTiersCard", () => {
  it("explains, calmly, that nothing has been decided yet", () => {
    const html = render([]);
    expect(html).toContain("No monthly tier has been decided for this member yet");
    expect(html).toContain("1st of next month");
  });

  it("shows the decision with its evidence", () => {
    const html = render([award()]);
    expect(html).toContain("December 2026");
    expect(html).toContain("Silver");
    expect(html).toContain("Decided from November 2026: $350.00 spent, 1 visit day.");
    expect(html).toContain("Rules version 1");
    expect(html).toContain("automatic");
  });

  it("labels test runs and recalculations", () => {
    expect(render([award({ isTest: true, source: "test" })])).toContain("Test");
    const html = render([award({ source: "recalculation", reason: "Refund entered late" })]);
    expect(html).toContain("Recalculated");
    expect(html).toContain("Reason: “Refund entered late”");
  });

  it("keeps a replaced result visible underneath", () => {
    const html = render([
      award({ id: "new", tier: "gold", label: "Gold", source: "recalculation", reason: "Fix" }),
      award({ id: "old", tier: "base", label: "Base", isCurrent: false }),
    ]);
    expect(html).toContain("Earlier result, replaced:");
    expect(html).toContain("Base");
    expect(html).toContain("Gold");
  });

  it("explains an award held back by a requirement", () => {
    const html = render([award({ tier: "base", label: "Base", requirementsMet: false })]);
    expect(html).toContain("A requirement wasn&#x27;t met that month");
  });

  it("describes a multi-month decision", () => {
    const html = render([
      award({
        lookbackMonths: 3,
        netSpendCents: 90000,
        visits: 5,
        months: [
          { month: "2026-09-01", spendCents: 0, visits: 0 },
          { month: "2026-10-01", spendCents: 30000, visits: 2 },
          { month: "2026-11-01", spendCents: 60000, visits: 3 },
        ],
      }),
    ]);
    expect(html).toContain("Decided from September 2026 to November 2026 (on average)");
    expect(html).toContain("$900.00 spent, 5 visit days in total");
  });

  it("only offers Recalculate to the Owner", () => {
    expect(render([award()], true)).toContain("Recalculate");
    expect(render([award()], false)).not.toContain("Recalculate");
  });
});
