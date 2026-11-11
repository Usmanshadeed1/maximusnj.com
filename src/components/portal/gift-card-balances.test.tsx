import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GiftCardBalances } from "./gift-card-balances";

describe("GiftCardBalances", () => {
  it("shows nothing when the member has no gift cards", () => {
    expect(renderToStaticMarkup(<GiftCardBalances cards={[]} />)).toBe("");
  });

  it("shows each card number and what's left on it", () => {
    const html = renderToStaticMarkup(
      <GiftCardBalances
        cards={[
          { code: "GC123456", balance_cents: 4550, active: true },
          { code: "ZX-9081", balance_cents: 1000, active: false },
        ]}
      />,
    );
    expect(html).toContain("Your gift cards");
    expect(html).toContain("GC123456");
    expect(html).toContain("$45.50");
    expect(html).toContain("Turned off, please ask in store");
    expect(html).not.toContain("$10.00"); // a card that is off doesn't show a balance to spend
  });
});
