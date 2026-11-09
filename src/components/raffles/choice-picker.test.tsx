import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChoicePicker } from "./choice-picker";

const products = [
  { id: "p1", name: "Booster Box" },
  { id: "p2", name: "Elite Trainer Box" },
  { id: "p3", name: "Bundle" },
];
const render = (value: string[], name?: string) =>
  renderToStaticMarkup(<ChoicePicker products={products} value={value} onChange={() => undefined} name={name} />);

describe("ChoicePicker", () => {
  it("asks the member to tap products when nothing is chosen", () => {
    const html = render([]);
    expect(html).toContain("Tap the products you want");
    expect(html.match(/aria-label="Remove/g)).toBeNull();
  });

  it("shows the chosen products as 1st, 2nd… and the rest to add", () => {
    const html = render(["p2", "p1"]);
    expect(html.indexOf("1st")).toBeLessThan(html.indexOf("Elite Trainer Box"));
    expect(html.indexOf("Elite Trainer Box")).toBeLessThan(html.indexOf("2nd"));
    expect(html).toContain("Tap to add");
    expect(html.match(/aria-label="Remove/g)).toHaveLength(2);
  });

  it("sends the order with the form, one field per choice", () => {
    const html = render(["p3", "p1"], "choices");
    expect(html).toContain('<input type="hidden" name="choices" value="p3"/><input type="hidden" name="choices" value="p1"/>');
  });

  it("ignores ids that are not on offer", () => {
    expect(render(["nope"])).toContain("Tap the products you want");
  });
});
