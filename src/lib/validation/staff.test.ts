import { describe, expect, it } from "vitest";
import { createEmployeeSchema, deleteLocationSchema, inviteEmployeeSchema, locationSchema, setPasswordSchema } from "./staff";

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

describe("createEmployeeSchema", () => {
  const base = { firstName: "Cara", lastName: "Created", email: "Cara@Example.com", role: "staff", locationIds: [] };

  it("requires a password of at least 10 characters", () => {
    expect(createEmployeeSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    const ok = createEmployeeSchema.parse({ ...base, password: "long-enough-1" });
    expect(ok.email).toBe("cara@example.com");
  });
});

describe("deleteLocationSchema", () => {
  it("needs a store id and the typed name", () => {
    const id = "6f1c2b9e-4d2a-4c8e-9b1a-2f3e4d5c6b7a";
    expect(deleteLocationSchema.safeParse({ id, confirmName: "" }).success).toBe(false);
    expect(deleteLocationSchema.safeParse({ id, confirmName: "Maximus Edison" }).success).toBe(true);
  });
});
