import { describe, expect, it } from "vitest";
import { formatPhone, isValidPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("keeps digits only, so every way of typing a number matches", () => {
    expect(normalizePhone("(201) 555-0123")).toBe("2015550123");
    expect(normalizePhone("201.555.0123")).toBe("2015550123");
    expect(normalizePhone("+1 201 555 0123")).toBe("2015550123");
  });

  it("keeps international numbers intact", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("442079460958");
  });
});

describe("isValidPhone", () => {
  it("accepts 10–15 digits", () => {
    expect(isValidPhone("2015550123")).toBe(true);
    expect(isValidPhone("201555")).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });
});

describe("formatPhone", () => {
  it("formats US numbers for display", () => {
    expect(formatPhone("2015550123")).toBe("(201) 555-0123");
    expect(formatPhone("442079460958")).toBe("+442079460958");
    expect(formatPhone(null)).toBe("");
  });
});
