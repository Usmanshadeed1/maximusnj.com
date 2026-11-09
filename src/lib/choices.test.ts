import { describe, expect, it } from "vitest";
import { addChoice, moveChoiceUp, ordinal, removeChoice } from "./choices";

describe("ranked choices", () => {
  it("adds a product as the next choice, never twice", () => {
    expect(addChoice([], "a")).toEqual(["a"]);
    expect(addChoice(["a"], "b")).toEqual(["a", "b"]);
    expect(addChoice(["a", "b"], "a")).toEqual(["a", "b"]);
  });

  it("removes a choice and closes the gap", () => {
    expect(removeChoice(["a", "b", "c"], "b")).toEqual(["a", "c"]);
    expect(removeChoice(["a"], "x")).toEqual(["a"]);
  });

  it("moves a choice up one place; the first stays first", () => {
    expect(moveChoiceUp(["a", "b", "c"], "c")).toEqual(["a", "c", "b"]);
    expect(moveChoiceUp(["a", "b"], "a")).toEqual(["a", "b"]);
    expect(moveChoiceUp(["a", "b"], "x")).toEqual(["a", "b"]);
  });

  it("names the places 1st, 2nd, 3rd…", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]);
  });
});
