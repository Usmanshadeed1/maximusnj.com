import { describe, expect, it } from "vitest";
import { customerSchema } from "./customer";

const STORE = "6f1c2b9e-4d2a-4c8e-9b1a-2f3e4d5c6b7a";
const base = { firstName: "Test", lastName: "One", homeLocationId: STORE };

describe("customerSchema", () => {
  it("normalises the mobile number to digits", () => {
    const parsed = customerSchema.parse({ ...base, mobile: "(201) 555-0123" });
    expect(parsed.mobile).toBe("2015550123");
    expect(parsed.email).toBeNull();
  });

  it("requires a mobile number by default", () => {
    const result = customerSchema.safeParse({ ...base, mobile: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["mobile"]);
  });

  it("requires email when 'No mobile number' is ticked", () => {
    const result = customerSchema.safeParse({ ...base, noMobile: true });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["email"]);
  });

  it("allows no phone and no email for in-store-only members", () => {
    const parsed = customerSchema.parse({ ...base, noMobile: true, inStoreOnly: true });
    expect(parsed.mobile).toBeNull();
    expect(parsed.email).toBeNull();
  });

  it("ignores a typed mobile when 'No mobile number' is ticked", () => {
    const parsed = customerSchema.parse({ ...base, noMobile: true, mobile: "2015550123", email: "A@B.co" });
    expect(parsed.mobile).toBeNull();
    expect(parsed.email).toBe("a@b.co");
  });

  it("rejects an invalid email", () => {
    expect(customerSchema.safeParse({ ...base, mobile: "2015550123", email: "nope" }).success).toBe(false);
  });
});
