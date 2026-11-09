import { describe, expect, it } from "vitest";
import { emailRequestSchema, notifyPrefsSchema, otpCodeSchema, pinSchema, setPinSchema, signUpSchema } from "./portal";

const STORE = "6f1c2b9e-4d2a-4c8e-9b1a-2f3e4d5c6b7a";

describe("pinSchema", () => {
  it("accepts 6 to 12 digits", () => {
    expect(pinSchema.safeParse("123456").success).toBe(true);
    expect(pinSchema.safeParse("123456789012").success).toBe(true);
  });

  it("rejects short, long and non-numeric PINs", () => {
    expect(pinSchema.safeParse("12345").success).toBe(false);
    expect(pinSchema.safeParse("1234567890123").success).toBe(false);
    expect(pinSchema.safeParse("12345a").success).toBe(false);
    expect(pinSchema.safeParse("12 456").success).toBe(false);
    expect(pinSchema.safeParse("").success).toBe(false);
  });

  it("needs the PIN to be typed twice the same way", () => {
    expect(setPinSchema.safeParse({ pin: "123456", confirmPin: "123456" }).success).toBe(true);
    const result = setPinSchema.safeParse({ pin: "123456", confirmPin: "654321" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["confirmPin"]);
  });
});

describe("emailed code", () => {
  it("accepts 6 digits even with spaces, rejects anything else", () => {
    expect(otpCodeSchema.parse(" 123 456 ")).toBe("123456");
    expect(otpCodeSchema.safeParse("12345").success).toBe(false);
    expect(otpCodeSchema.safeParse("12345a").success).toBe(false);
  });

  it("lower-cases and trims the email", () => {
    expect(emailRequestSchema.parse({ email: "  Fan@Example.COM " }).email).toBe("fan@example.com");
    expect(emailRequestSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });
});

describe("signUpSchema", () => {
  const valid = { firstName: "Nia", lastName: "Newbie", mobile: "(201) 555-0123", homeLocationId: STORE, age13: true };

  it("normalises the phone number", () => {
    expect(signUpSchema.parse(valid).mobile).toBe("2015550123");
  });

  it("needs the 13-or-older confirmation", () => {
    const result = signUpSchema.safeParse({ ...valid, age13: false });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["age13"]);
  });

  it("needs a name, a real phone number and a store", () => {
    expect(signUpSchema.safeParse({ ...valid, firstName: " " }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, mobile: "555" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, homeLocationId: "" }).success).toBe(false);
  });
});

describe("notifyPrefsSchema", () => {
  it("allows email, portal and phone only", () => {
    expect(notifyPrefsSchema.safeParse(["email", "phone"]).success).toBe(true);
    expect(notifyPrefsSchema.safeParse([]).success).toBe(true);
    expect(notifyPrefsSchema.safeParse(["sms"]).success).toBe(false);
  });
});
