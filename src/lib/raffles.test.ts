import { describe, expect, it } from "vitest";
import { describeChannels, rafflePhase } from "./raffles";

const OPENS = "2026-12-01T15:00:00Z";
const CLOSES = "2026-12-05T15:00:00Z";

describe("rafflePhase", () => {
  it("is open only between the opening and closing times", () => {
    expect(rafflePhase("open", OPENS, CLOSES, new Date("2026-11-30T12:00:00Z"))).toBe("upcoming");
    expect(rafflePhase("open", OPENS, CLOSES, new Date("2026-12-01T15:00:00Z"))).toBe("open");
    expect(rafflePhase("open", OPENS, CLOSES, new Date("2026-12-05T14:59:59Z"))).toBe("open");
    expect(rafflePhase("open", OPENS, CLOSES, new Date("2026-12-05T15:00:00Z"))).toBe("closed");
  });

  it("keeps drafts, drawn, completed and cancelled raffles as they are", () => {
    const during = new Date("2026-12-02T12:00:00Z");
    for (const status of ["draft", "drawn", "completed", "cancelled"] as const) {
      expect(rafflePhase(status, OPENS, CLOSES, during)).toBe(status);
    }
  });
});

describe("describeChannels", () => {
  it("lists the allowed methods in plain words", () => {
    expect(describeChannels(["email", "portal"])).toBe("Email and Member page");
    expect(describeChannels(["email"])).toBe("Email");
    expect(describeChannels([])).toContain("staff call the winners");
  });
});
