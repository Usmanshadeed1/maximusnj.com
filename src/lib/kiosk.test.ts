import { describe, expect, it } from "vitest";
import { cleanMemberNumber, isPlausibleMemberNumber, kioskScreen, wrongPinMessage } from "./kiosk";

describe("cleanMemberNumber", () => {
  it("strips scanner whitespace and upper-cases", () => {
    expect(cleanMemberNumber(" max000030\r\n")).toBe("MAX000030");
    expect(cleanMemberNumber("MAX-000-030")).toBe("MAX000030");
  });
});

describe("isPlausibleMemberNumber", () => {
  it("accepts MAX and legacy numbers, rejects junk", () => {
    expect(isPlausibleMemberNumber("MAX000030")).toBe(true);
    expect(isPlausibleMemberNumber("MC999999")).toBe(true);
    expect(isPlausibleMemberNumber("12345")).toBe(false);
    expect(isPlausibleMemberNumber("")).toBe(false);
  });
});

describe("kioskScreen", () => {
  it("is green with the first name on success", () => {
    const s = kioskScreen({ kind: "checked_in", firstName: "Kira", tier: "base", qualifying: true });
    expect(s.tone).toBe("success");
    expect(s.title).toBe("Welcome, Kira!");
  });

  it("is red for every failure, with the required wording", () => {
    expect(kioskScreen({ kind: "not_found" })).toMatchObject({ tone: "error", title: "Member not found" });
    expect(kioskScreen({ kind: "inactive" })).toMatchObject({ tone: "error", title: "Inactive member" });
    expect(kioskScreen({ kind: "already_checked_in", firstName: "Kira", tier: "base" })).toMatchObject({
      tone: "error",
      title: "Already checked in",
    });
    expect(kioskScreen({ kind: "error" }).tone).toBe("error");
  });
});

describe("kiosk PIN wording", () => {
  it("shows a locked PIN as a red screen that says how long to wait", () => {
    expect(kioskScreen({ kind: "pin_locked", minutesLeft: 5 })).toMatchObject({
      tone: "error",
      title: "PIN locked",
      message: expect.stringContaining("5 minutes"),
    });
    expect(kioskScreen({ kind: "pin_locked", minutesLeft: 1 }).message).toContain("1 minute ");
  });

  it("counts the tries left after a wrong PIN", () => {
    expect(wrongPinMessage(4)).toBe("That PIN isn't right. 4 tries left.");
    expect(wrongPinMessage(1)).toBe("That PIN isn't right. 1 try left.");
  });
});
