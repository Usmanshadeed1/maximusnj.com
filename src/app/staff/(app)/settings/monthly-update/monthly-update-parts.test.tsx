import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RecalculateDialog } from "@/components/tiers/recalculate-dialog";
import { friendlyRunError } from "@/lib/tier/run-messages";
import { RunNowPanel } from "./run-now-panel";
import { TestToolsCard } from "./test-tools-card";

vi.mock("@/server/actions/tier-awards", () => ({
  runMonthlyUpdateNowAction: vi.fn(),
  runTestUpdateAction: vi.fn(),
  recalculateAction: vi.fn(),
}));

describe("RunNowPanel", () => {
  it("shows a clear button", () => {
    const html = renderToStaticMarkup(<RunNowPanel label="Run the update now" emphasise />);
    expect(html).toContain("Run the update now");
    expect(html).not.toMatch(/ disabled(=|>| )/); // the real attribute, not a styling class
  });
});

describe("TestToolsCard", () => {
  const html = renderToStaticMarkup(
    <TestToolsCard
      options={[
        { value: "2026-12-01", label: "December 2026 — what the 1st of next month will do" },
        { value: "2026-11-01", label: "November 2026 — this month" },
      ]}
    />,
  );

  it("is clearly marked as a test-only tool", () => {
    expect(html).toContain("Test tools — only on this test site");
    expect(html).toContain("marked");
    expect(html).toContain("Test");
  });

  it("walks through what to do", () => {
    expect(html).toContain("Record a purchase and a check-in for a member.");
    expect(html).toContain("Run month-end test");
  });

  it("offers next month first", () => {
    expect(html.indexOf("December 2026")).toBeLessThan(html.indexOf("November 2026"));
  });
});

describe("RecalculateDialog", () => {
  it("shows a button for the Owner to open it", () => {
    const html = renderToStaticMarkup(
      <RecalculateDialog monthOptions={[{ value: "2026-11-01", label: "November 2026" }]} title="Recalculate everyone" description="x" buttonLabel="Recalculate everyone…" />,
    );
    expect(html).toContain("Recalculate everyone…");
  });
});

describe("friendlyRunError", () => {
  it("turns technical problems into plain words", () => {
    expect(friendlyRunError("no_rules_for_month")).toBe("There were no tier rules for that month.");
    expect(friendlyRunError(null)).toBe("Something went wrong.");
    expect(friendlyRunError("connection lost")).toBe("connection lost");
  });
});
