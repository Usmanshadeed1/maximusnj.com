import { describe, expect, it } from "vitest";
import { PASSWORD_ALPHABET, generatePassword } from "./password";

describe("generatePassword", () => {
  it("has the requested length, 14 by default", () => {
    expect(generatePassword()).toHaveLength(14);
    expect(generatePassword(20)).toHaveLength(20);
  });

  it("only uses unambiguous characters", () => {
    const password = generatePassword(500);
    for (const char of password) expect(PASSWORD_ALPHABET).toContain(char);
    expect(password).not.toMatch(/[0O1lI]/);
  });

  it("is different every time", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
