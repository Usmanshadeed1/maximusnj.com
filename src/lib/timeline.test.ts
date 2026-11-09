import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timeline";

const empty = { visits: [], transactions: [], awards: [], raffles: [] };

describe("buildTimeline", () => {
  it("merges visits, money, tiers and raffles newest first", () => {
    const items = buildTimeline({
      visits: [{ checkedInAt: "2026-11-03T15:00:00Z", storeName: "Hoboken", counted: true, qualifying: true }],
      transactions: [
        { type: "purchase", amountCents: 12500, direction: null, occurredAt: "2026-11-04T15:00:00Z", storeName: "Hoboken", note: null, voided: null },
        { type: "refund", amountCents: 2000, direction: null, occurredAt: "2026-11-02T15:00:00Z", storeName: "Hoboken", note: "Damaged", voided: null },
      ],
      awards: [{ calculatedAt: "2026-11-01T05:05:00Z", awardedMonth: "2026-11-01", label: "Silver", isCurrent: true, isTest: false }],
      raffles: [{ at: "2026-11-05T15:00:00Z", release: "Surging Sparks", store: "Hoboken", channel: "online", status: "active", outcome: "claimed" }],
    });
    expect(items.map((i) => i.kind)).toEqual(["raffle", "money", "visit", "money", "tier"]);
    expect(items[0].title).toBe("Surging Sparks raffle: won and collected");
    expect(items[1].title).toBe("Purchase $125.00");
    expect(items[3].title).toBe("Refund −$20.00");
    expect(items[3].detail).toContain("Damaged");
    expect(items[2].detail).toContain("counts toward tier");
  });

  it("marks voided entries, hides test tier runs, and explains replaced results", () => {
    const items = buildTimeline({
      ...empty,
      transactions: [
        { type: "purchase", amountCents: 999, direction: null, occurredAt: "2026-11-04T15:00:00Z", storeName: "Hoboken", note: null, voided: { reason: "typo" } },
      ],
      awards: [
        { calculatedAt: "2026-11-01T05:05:00Z", awardedMonth: "2026-11-01", label: "Gold", isCurrent: false, isTest: false },
        { calculatedAt: "2026-11-01T05:06:00Z", awardedMonth: "2026-12-01", label: "Gold", isCurrent: true, isTest: true },
      ],
    });
    expect(items).toHaveLength(2);
    expect(items[0].title).toContain("(voided)");
    expect(items[0].detail).toContain("typo");
    expect(items[1].detail).toBe("Replaced by a later result");
  });

  it("describes raffle entries that did not stay active", () => {
    const [withdrew, removed] = buildTimeline({
      ...empty,
      raffles: [
        { at: "2026-11-05T15:00:00Z", release: "A", store: "X", channel: "in_store", status: "withdrawn", outcome: null },
        { at: "2026-11-04T15:00:00Z", release: "B", store: "X", channel: "online", status: "removed", outcome: null },
      ],
    });
    expect(withdrew.title).toBe("A raffle: entered, then withdrew");
    expect(removed.title).toBe("B raffle: entry removed by staff");
  });

  it("keeps only the newest items", () => {
    const visits = Array.from({ length: 60 }, (_, i) => ({
      checkedInAt: `2026-10-${String((i % 28) + 1).padStart(2, "0")}T12:00:00Z`,
      storeName: "S",
      counted: true,
      qualifying: false,
    }));
    expect(buildTimeline({ ...empty, visits }, 10)).toHaveLength(10);
  });
});
