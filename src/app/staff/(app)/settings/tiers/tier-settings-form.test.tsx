import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ruleSetToFormValues } from "@/lib/tier/form-values";
import { TierSettingsForm } from "./tier-settings-form";

vi.mock("@/server/actions/tiers", () => ({ saveTierRulesAction: vi.fn() }));

const initial = ruleSetToFormValues({
  rules: {
    visitValueCents: 0,
    lookbackMonths: 1,
    method: "average",
    carryOver: false,
    requirePurchase: true,
    requireVisit: true,
    thresholds: { silver: 30000, gold: 60000, diamond: 100000 },
  },
  tiers: [
    { key: "base", name: "Base", benefits: null },
    { key: "silver", name: "Silver", benefits: "5% off" },
    { key: "gold", name: "Gold", benefits: null },
    { key: "diamond", name: "Diamond", benefits: null },
  ],
});

const render = (values = initial) => renderToStaticMarkup(<TierSettingsForm initial={values} startsOn="Dec 1, 2026" />);

describe("TierSettingsForm", () => {
  it("shows every setting, filled in from the saved rules", () => {
    const html = render();
    for (const label of ["Tiers", "Points", "How far back we look", "Requirements", "Try it"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('value="300.00"');
    expect(html).toContain('value="600.00"');
    expect(html).toContain('value="1000.00"');
    expect(html).toContain('name="visitValue"');
    expect(html).toContain("5% off");
  });

  it("starts with nothing to save", () => {
    const html = render();
    expect(html).toContain("No unsaved changes");
    expect(html).toContain("Save · takes effect Dec 1, 2026");
  });

  it("previews the ladder with the tier names and what each needs", () => {
    const html = render();
    expect(html).toContain("Start here");
    expect(html).toContain("$300.00");
    expect(html).toContain("$1,000.00");
  });

  it("explains the points formula", () => {
    expect(render()).toContain("Points = money spent + visits");
  });

  it("includes a working 'Try it' example", () => {
    const html = render();
    // $540 and 4 visits is Silver under the launch rules.
    expect(html).toContain("They would earn");
    expect(html).toContain("Silver");
    expect(html).toContain("To reach");
  });

  it("disables the look-back choices and carry-over when looking back one month", () => {
    const html = render();
    expect(html).toContain("With a 1-month look-back both choices give the same result.");
    expect(html).not.toContain("Only available with a 1-month look-back.");
    expect(html).toContain("Spending beyond what a tier needs becomes credit for next month");
  });

  it("explains that carry-over needs a one-month look-back otherwise", () => {
    const html = render({ ...initial, lookbackMonths: "3" });
    expect(html).toContain("Only available with a 1-month look-back.");
    expect(html).not.toContain("With a 1-month look-back both choices give the same result.");
  });
});
