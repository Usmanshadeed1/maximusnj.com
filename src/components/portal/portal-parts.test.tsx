import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { progressToNextTier, type TierRules } from "@/lib/tier/engine";
import type { PortalData } from "@/server/portal";
import { ActivityList, PortalMemberCard, mergeActivity } from "./portal-parts";
import { TierSummary } from "./tier-summary";

// The portal data type lives in a server-only module; only its shape is needed here.
vi.mock("server-only", () => ({}));
// next/image needs the build pipeline; a plain marker is enough for these checks.
vi.mock("@/components/brand/logo", () => ({ Logo: () => <span>Maximus logo</span> }));

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

function data(overrides: Partial<PortalData> = {}, spendCents = 18000, visits = 1): PortalData {
  const months = [{ spendCents, visits }];
  return {
    firstName: "Sol",
    lastName: "Solo",
    memberNumber: "MAX000123",
    email: "sol@example.com",
    mobile: "2015550123",
    homeStore: "Hoboken",
    memberSince: "2026-01-15T12:00:00Z",
    active: true,
    notifyPrefs: [],
    hasPin: false,
    month: "2026-11-01",
    tier: { key: "base", label: "Base", source: "start", decidedFrom: null, benefits: null },
    names: { ...NAMES },
    benefits: { base: null, silver: null, gold: null, diamond: null },
    projection: {
      tier: "base",
      label: "Base",
      forMonth: "2026-12-01",
      scoreCents: spendCents,
      months: [{ ...months[0], month: "2026-11-01" }],
      thisMonth: { spendCents, visits, pointsCents: spendCents },
      rules: RULES,
      ruleVersion: 1,
      names: { ...NAMES },
      thresholds: [
        { key: "base", name: "Base", thresholdCents: 0 },
        { key: "silver", name: "Silver", thresholdCents: 30000 },
        { key: "gold", name: "Gold", thresholdCents: 60000 },
        { key: "diamond", name: "Diamond", thresholdCents: 100000 },
      ],
      progress: progressToNextTier(months, RULES),
    },
    visits: [{ at: "2026-11-03T15:00:00Z", store: "Hoboken", counts: true }],
    purchases: [
      { at: "2026-11-04T15:00:00Z", store: "Hoboken", type: "purchase", amountCents: 12500 },
      { at: "2026-11-02T15:00:00Z", store: "Jersey City", type: "refund", amountCents: 2000 },
    ],
    ...overrides,
  };
}

describe("PortalMemberCard", () => {
  it("shows the same card as the printed one: name, number, tier and barcode", () => {
    const html = renderToStaticMarkup(<PortalMemberCard data={data()} />);
    expect(html).toContain("Sol Solo");
    expect(html).toContain("MAX000123");
    expect(html).toContain("Base");
    expect(html).toContain("<svg viewBox"); // the same barcode as the printed card
  });
});

describe("activity", () => {
  it("lists purchases, refunds and visits newest first", () => {
    const items = mergeActivity(data());
    expect(items.map((i) => i.kind)).toEqual(["purchase", "visit", "refund"]);
  });

  it("shows amounts, marks refunds, and says nothing about notes or staff", () => {
    const html = renderToStaticMarkup(<ActivityList items={mergeActivity(data())} empty="none" />);
    expect(html).toContain("$125.00");
    expect(html).toContain("−$20.00");
    expect(html).toContain("Store visit");
    expect(html).toContain("Counted");
    expect(html.toLowerCase()).not.toContain("note");
    expect(html.toLowerCase()).not.toContain("trade");
  });

  it("shows the friendly message when there is nothing yet", () => {
    expect(renderToStaticMarkup(<ActivityList items={[]} empty="Nothing here yet." />)).toContain("Nothing here yet.");
  });
});

describe("TierSummary", () => {
  it("labels the current and the on-track tier separately", () => {
    const html = renderToStaticMarkup(<TierSummary data={data()} />);
    expect(html).toContain("Your tier now");
    expect(html).toContain("On track for December 2026");
    expect(html).toContain("Valid for November 2026.");
  });

  it("shows progress, the easiest way up, and this month's numbers", () => {
    const html = renderToStaticMarkup(<TierSummary data={data()} />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("$180.00 of $300.00 points");
    expect(html).toContain("$120.00");
    expect(html).toContain("$180.00");
  });

  it("congratulates a member at the top tier", () => {
    const top = data({}, 150000, 2);
    const html = renderToStaticMarkup(<TierSummary data={top} />);
    expect(html).toContain("top tier");
    expect(html).not.toContain('role="progressbar"');
  });

  it("says what the member still needs when a requirement is missing", () => {
    const html = renderToStaticMarkup(<TierSummary data={data({}, 0, 0)} />);
    expect(html).toContain("you still need a purchase and a store visit");
  });

  it("says where the current tier came from", () => {
    const fromAward = renderToStaticMarkup(
      <TierSummary data={data({ tier: { key: "silver", label: "Silver", source: "award", decidedFrom: "2026-10-01", benefits: null } })} />,
    );
    expect(fromAward).toContain("Earned from your October 2026 activity.");
    const set = renderToStaticMarkup(
      <TierSummary data={data({ tier: { key: "gold", label: "Gold", source: "override", decidedFrom: null, benefits: null } })} />,
    );
    expect(set).toContain("Set for you by the store team.");
    expect(set).not.toContain("Owner");
  });
});
