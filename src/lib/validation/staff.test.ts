import { describe, expect, it } from "vitest";
import { inviteEmployeeSchema, locationSchema, setPasswordSchema } from "./staff";

describe("locationSchema", () => {
  it("upper-cases and accepts a valid store code", () => {
    const parsed = locationSchema.parse({ name: "Maximus Edison", code: "nj1" });
    expect(parsed.code).toBe("NJ1");
  });

  it("rejects codes with spaces or symbols", () => {
    expect(locationSchema.safeParse({ name: "Store", code: "NJ 1" }).success).toBe(false);
    expect(locationSchema.safeParse({ name: "Store", code: "NJ-1" }).success).toBe(false);
  });
});

describe("inviteEmployeeSchema", () => {
  it("normalises the email", () => {
    const parsed = inviteEmployeeSchema.parse({
      firstName: " Ana ",
      lastName: "Lee",
      email: " Ana@Example.COM ",
      role: "staff",
      locationIds: [],
    });
    expect(parsed.email).toBe("ana@example.com");
    expect(parsed.firstName).toBe("Ana");
  });

  it("rejects an unknown role", () => {
    const result = inviteEmployeeSchema.safeParse({
      firstName: "A",
      lastName: "B",
      email: "a@b.co",
      role: "admin",
    });
    expect(result.success).toBe(false);
  });
});

describe("setPasswordSchema", () => {
  it("requires matching passwords of at least 10 characters", () => {
    expect(setPasswordSchema.safeParse({ password: "short", confirmPassword: "short" }).success).toBe(false);
    expect(
      setPasswordSchema.safeParse({ password: "long-enough-1", confirmPassword: "different-123" }).success,
    ).toBe(false);
    expect(
      setPasswordSchema.safeParse({ password: "long-enough-1", confirmPassword: "long-enough-1" }).success,
    ).toBe(true);
  });
});
