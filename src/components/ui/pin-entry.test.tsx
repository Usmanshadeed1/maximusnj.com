import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PinEntry } from "./pin-entry";

const render = (props: Partial<Parameters<typeof PinEntry>[0]> = {}) =>
  renderToStaticMarkup(<PinEntry value="" onChange={() => undefined} {...props} />);

describe("PinEntry", () => {
  it("has the ten number keys and a delete key", () => {
    const html = render();
    for (const digit of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]) expect(html).toContain(`>${digit}</button>`);
    expect(html).toContain('aria-label="Delete last number"');
  });

  it("shows at least six empty slots and never the digits by default", () => {
    const html = render({ value: "123" });
    expect(html).toContain('aria-label="3 numbers entered"');
    expect(html.match(/rounded-full border-2/g)?.length).toBe(6);
    expect(html).not.toContain(">123<");
  });

  it("grows past six slots for longer PINs and can reveal the numbers", () => {
    const html = render({ value: "12345678", revealed: true });
    expect(html).toContain(">8</span>");
    expect(html).toContain('aria-label="8 numbers entered"');
  });

  it("disables every key while busy", () => {
    const html = render({ disabled: true });
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(10);
  });
});
