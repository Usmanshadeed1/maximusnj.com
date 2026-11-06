import { describe, expect, it } from "vitest";
import { friendlyDbError } from "./action-result";

describe("friendlyDbError", () => {
  it("maps known database messages", () => {
    expect(friendlyDbError({ code: "P0001", message: "last_owner" })).toMatch(/at least one active Owner/);
    expect(friendlyDbError({ code: "42501", message: "managers_invite_staff_only" })).toMatch(/only invite Staff/);
  });

  it("maps permission and duplicate codes", () => {
    expect(friendlyDbError({ code: "42501", message: "permission denied for table x" })).toMatch(/permission/);
    expect(friendlyDbError({ code: "23505", message: "duplicate key" })).toMatch(/already exists/);
  });

  it("never leaks raw database text", () => {
    expect(friendlyDbError({ code: "XX000", message: "internal: relation secret_table" })).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
