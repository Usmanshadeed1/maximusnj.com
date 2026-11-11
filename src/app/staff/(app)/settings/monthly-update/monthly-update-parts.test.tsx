import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RecalculateDialog } from "@/components/tiers/recalculate-dialog";
import { friendlyRunError } from "@/lib/tier/run-messages";
import { RunNowPanel } from "./run-now-panel";

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
