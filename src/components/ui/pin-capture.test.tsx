import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PinCapture } from "./pin-capture";

const render = (value: string, name?: string) =>
  renderToStaticMarkup(<PinCapture value={value} onChange={() => undefined} name={name} />);

describe("PinCapture", () => {
  it("starts with one clear button for the customer", () => {
    expect(render("")).toContain("Let the customer choose a PIN");
  });

  it("never shows the chosen PIN, only that one was chosen", () => {
    const html = render("918273");
    expect(html).toContain("PIN chosen (hidden)");
    expect(html).not.toContain(">918273<");
  });

  it("sends the PIN with the form when it has a name", () => {
    expect(render("918273", "pin")).toContain('<input type="hidden" name="pin" value="918273"/>');
    expect(render("", "pin")).toContain('<input type="hidden" name="pin" value=""/>');
  });
});
