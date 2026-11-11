import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ruleSetToFormValues } from "@/lib/tier/form-values";
import { TierSettingsForm } from "./tier-settings-form";

vi.mock("@/server/actions/tiers", () => ({ saveTierRulesAction: vi.fn() }));

const rules = {
  visitValueCents: 0,
  lookbackMonths: 1,
  method: "average" as const,
  carryOver: false,
  requirePurchase: true,
  requireVisit: true,
  thresholds: { silver: 30000, gold: 60000, diamond: 100000 },
};
const tiers = [
  { key: "base" as const, name: "Base", benefits: null },
  { key: "silver" as const, name: "Silver", benefits: "5% off" },
  { key: "gold" as const, name: "Gold", benefits: null },
  { key: "diamond" as const, name: "Diamond", benefits: null },
];

const initial = ruleSetToFormValues({ rules, tiers });
const render = (values = initial) => renderToStaticMarkup(<TierSettingsForm initial={values} startsOn="Dec 1, 2026" />);

describe("TierSettingsForm", () => {
  it("is laid out in numbered, plainly named sections", () => {
    const html = render();
    for (const heading of ["Your tiers", "Do store visits count?", "Extra rules", "Advanced options"]) {
      expect(html).toContain(heading);
    }
  });

  it("fills every box from the saved rules", () => {
    const html = render();
    expect(html).toContain('value="300.00"');
    expect(html).toContain('value="600.00"');
    expect(html).toContain('value="1000.00"');
    expect(html).not.toContain("What members get"); // no benefits box any more
  });

  it("starts with nothing to save", () => {
    const html = render();
    expect(html).toContain("No unsaved changes");
    expect(html).toContain("Save — starts Dec 1, 2026");
  });

  it("previews the ladder with the names and what each needs", () => {
    const html = render();
    expect(html).toContain("Everyone starts here");
    expect(html).toContain("$300.00");
    expect(html).toContain("$1,000.00");
  });

  it("asks about visits as a simple yes or no", () => {
    const html = render();
    expect(html).toContain("No — only spending counts");
    expect(html).toContain("Yes — each visit day adds a bonus");
    expect(html).not.toContain("Bonus for each visit day");
    expect(html).toContain("Points = money spent");
    expect(html).not.toContain("visit days</p>");
  });

  it("shows the bonus box and the formula when visits count", () => {
    const html = render({ ...initial, visitValue: "20.00" });
    expect(html).toContain("Bonus for each visit day");
    expect(html).toContain("Points = money spent + $20.00 × visit days");
    expect(html).toContain("4 visit days add $80.00");
  });

  it("has no 'Try it out' box", () => {
    expect(render()).not.toContain("Try it out");
  });

  it("folds the look-back choices into Advanced options, with a plain summary", () => {
    const html = render();
    expect(html).toContain("looking at last month only");
    expect(html).toContain("Carry extra spending forward");
    expect(html).toContain("With a 1-month look-back both choices give the same result.");
  });

  it("explains carry-over needs a one-month look-back otherwise", () => {
    const html = render({ ...initial, lookbackMonths: "3" });
    expect(html).toContain("looking at the last 3 months (average)");
    expect(html).toContain("Only available when you look back 1 month.");
    expect(html).not.toContain("With a 1-month look-back both choices give the same result.");
  });
});
