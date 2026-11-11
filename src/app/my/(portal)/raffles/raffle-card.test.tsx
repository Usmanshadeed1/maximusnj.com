import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PortalRaffle } from "@/server/portal";
import { RaffleCard } from "./raffle-card";

// The buttons call server actions; they aren't exercised when only rendering.
vi.mock("@/server/actions/portal", () => ({ enterRaffleAction: vi.fn(), withdrawRaffleAction: vi.fn() }));

const raffle = (overrides: Partial<PortalRaffle> = {}): PortalRaffle => ({
  id: "6f1c2b9e-4d2a-4c8e-9b1a-2f3e4d5c6b7a",
  name: "Surging Sparks booster box",
  description: "One box per winner.",
  imageUrl: null,
  releaseDate: "2026-12-12",
  scope: "store",
  store: "Hoboken",
  pickup: "Hoboken",
  pickupRule: "raffle_store",
  winners: 3,
  opensAt: "2026-12-01T15:00:00Z",
  closesAt: "2026-12-05T23:30:00Z",
  phase: "open",
  entered: false,
  enteredOther: false,
  removed: false,
  products: [],
  myChoices: [],
  result: null,
  ...overrides,
});

const render = (r: PortalRaffle, active = true) => renderToStaticMarkup(<RaffleCard raffle={r} active={active} />);

describe("RaffleCard", () => {
  it("shows the release, the store and when it closes (no winner count)", () => {
    const html = render(raffle());
    expect(html).toContain("Surging Sparks booster box");
    expect(html).toContain("Hoboken");
    expect(html).not.toContain("winners</dd>");
    expect(html).toContain("Closes Dec 5, 2026");
    expect(html).toContain("Pay and pick up in store");
  });

  it("offers Enter for an open raffle, and Withdraw once entered", () => {
    expect(render(raffle())).toContain("Enter the raffle");
    const entered = render(raffle({ entered: true }));
    expect(entered).toContain("Withdraw my entry");
    expect(entered).toContain("You&#x27;re entered");
    expect(entered).not.toContain("Enter the raffle");
  });

  it("blocks a second store's raffle for the same release", () => {
    const html = render(raffle({ enteredOther: true }));
    expect(html).not.toContain("Enter the raffle");
    expect(html).toContain("You can only enter one");
  });

  it("does not let a member put themselves back after staff removed them", () => {
    const html = render(raffle({ removed: true }));
    expect(html).not.toContain("Enter the raffle");
    expect(html).toContain("ask a team member");
  });

  it("explains an upcoming raffle and a closed one, without any button", () => {
    const upcoming = render(raffle({ phase: "upcoming" }));
    expect(upcoming).toContain("You can enter from");
    expect(upcoming).not.toContain("Enter the raffle");
    const closed = render(raffle({ phase: "closed", entered: true }));
    expect(closed).toContain("Entries are closed");
    expect(closed).not.toContain("Withdraw my entry");
  });

  it("never shows how many people have entered", () => {
    const html = render(raffle({ entered: true })).toLowerCase();
    expect(html).not.toContain("entries");
    expect(html).not.toContain("people entered");
  });
});

describe("RaffleCard after the draw", () => {
  const drawn = (result: PortalRaffle["result"], extra: Partial<PortalRaffle> = {}) =>
    render(raffle({ phase: "drawn", entered: true, result, ...extra }));

  it("tells a winner where to collect and by when, with no Withdraw button", () => {
    const html = drawn({ state: "won", deadline_at: "2026-12-07T23:30:00Z", product: "Elite Trainer Box" }, { pickup: "Hoboken" });
    expect(html).toContain("You won!");
    expect(html).toContain("Hoboken");
    expect(html).toContain("Dec 7, 2026");
    expect(html).toContain("Elite Trainer Box");
    expect(html).not.toContain("Withdraw my entry");
  });

  it("does not say won before they have been told", () => {
    const html = drawn({ state: "waiting" });
    expect(html).not.toContain("You won!");
    expect(html).toContain("We&#x27;ll contact you if you&#x27;re picked");
  });

  it("covers every other result in plain words", () => {
    expect(drawn({ state: "collected", product: null })).toContain("You collected your prize");
    expect(drawn({ state: "collected", product: "Booster Box" })).toContain("You collected Booster Box");
    expect(drawn({ state: "expired" })).toContain("The time to collect ended");
    expect(drawn({ state: "declined" })).toContain("You passed on this spot");
    expect(drawn({ state: "not_selected" })).toContain("You weren&#x27;t selected this time");
  });

  it("never shows a draw position", () => {
    expect(drawn({ state: "waiting" }).toLowerCase()).not.toContain("position");
  });
});

describe("RaffleCard with products", () => {
  const products = [
    { id: "p1", name: "Booster Box", description: null, image_url: null },
    { id: "p2", name: "Elite Trainer Box", description: null, image_url: null },
  ];

  it("lists the products and asks the member to choose before entering", () => {
    const html = render(raffle({ products }));
    expect(html).toContain("Booster Box · Elite Trainer Box");
    expect(html).toContain("Choose products and enter");
    expect(html).not.toContain(">Enter the raffle<");
  });

  it("shows the member's own choices, in their order, once entered", () => {
    const html = render(raffle({ products, entered: true, myChoices: ["Elite Trainer Box", "Booster Box"] }));
    expect(html).toContain("Your choices");
    expect(html.indexOf("Elite Trainer Box")).toBeLessThan(html.lastIndexOf("Booster Box"));
    expect(html).toContain("Withdraw my entry");
  });
});
