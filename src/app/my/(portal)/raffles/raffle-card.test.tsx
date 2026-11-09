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
  ...overrides,
});

const render = (r: PortalRaffle, active = true) => renderToStaticMarkup(<RaffleCard raffle={r} active={active} />);

describe("RaffleCard", () => {
  it("shows the release, the store, the winners and when it closes", () => {
    const html = render(raffle());
    expect(html).toContain("Surging Sparks booster box");
    expect(html).toContain("Hoboken");
    expect(html).toContain("<strong>3</strong> winners");
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
