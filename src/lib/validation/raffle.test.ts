import { describe, expect, it } from "vitest";
import { cancelRaffleSchema, raffleSettingsSchema, releaseSchema } from "./raffle";

const STORE_A = "6f1c2b9e-4d2a-4c8e-9b1a-2f3e4d5c6b7a";
const STORE_B = "7f1c2b9e-4d2a-4c8e-9b1a-2f3e4d5c6b7b";
const base = {
  scope: "store",
  locationIds: [STORE_A, STORE_B],
  winnerCount: "3",
  opensDate: "2026-12-01",
  opensTime: "10:00",
  closesDate: "2026-12-05",
  closesTime: "18:30",
  claimHours: "48",
  channels: ["email"],
};

describe("raffleSettingsSchema", () => {
  it("turns New York wall time into exact instants (winter, UTC-5)", () => {
    const parsed = raffleSettingsSchema.parse(base);
    expect(parsed.opensAt).toBe("2026-12-01T15:00:00.000Z");
    expect(parsed.closesAt).toBe("2026-12-05T23:30:00.000Z");
    expect(parsed.winnerCount).toBe(3);
    expect(parsed.pickupRule).toBe("raffle_store");
  });

  it("handles daylight saving time (summer, UTC-4)", () => {
    const parsed = raffleSettingsSchema.parse({ ...base, opensDate: "2026-07-01", closesDate: "2026-07-03" });
    expect(parsed.opensAt).toBe("2026-07-01T14:00:00.000Z");
  });

  it("needs at least one store for a store raffle", () => {
    const result = raffleSettingsSchema.safeParse({ ...base, locationIds: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["locationIds"]);
  });

  it("ignores stores for a company-wide raffle and lets the pickup be chosen", () => {
    const parsed = raffleSettingsSchema.parse({ ...base, scope: "company", pickupRule: "specific_store", pickupLocationId: STORE_B });
    expect(parsed.locationIds).toEqual([]);
    expect(parsed.pickupLocationId).toBe(STORE_B);
    const home = raffleSettingsSchema.parse({ ...base, scope: "company", pickupRule: "home_store" });
    expect(home.pickupLocationId).toBeNull();
  });

  it("needs a pickup store when a specific store is chosen", () => {
    const result = raffleSettingsSchema.safeParse({ ...base, scope: "company", pickupRule: "specific_store" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["pickupLocationId"]);
  });

  it("must close after it opens", () => {
    const result = raffleSettingsSchema.safeParse({ ...base, closesDate: "2026-12-01", closesTime: "09:00" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["closesDate"]);
  });

  it("checks winners and the claim deadline", () => {
    expect(raffleSettingsSchema.safeParse({ ...base, winnerCount: "0" }).success).toBe(false);
    expect(raffleSettingsSchema.safeParse({ ...base, winnerCount: "2.5" }).success).toBe(false);
    expect(raffleSettingsSchema.safeParse({ ...base, claimHours: "0" }).success).toBe(false);
    expect(raffleSettingsSchema.safeParse({ ...base, claimHours: "721" }).success).toBe(false);
  });

  it("allows no notification methods (staff phone the winners)", () => {
    expect(raffleSettingsSchema.parse({ ...base, channels: [] }).channels).toEqual([]);
    expect(raffleSettingsSchema.safeParse({ ...base, channels: ["sms"] }).success).toBe(false);
  });
});

describe("releaseSchema", () => {
  it("needs a name, and only accepts web addresses for the image", () => {
    expect(releaseSchema.safeParse({ name: " " }).success).toBe(false);
    expect(releaseSchema.safeParse({ name: "New set", imageUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(releaseSchema.safeParse({ name: "New set", imageUrl: "https://example.com/a.png", releaseDate: "2026-12-12" }).success).toBe(true);
    expect(releaseSchema.parse({ name: "New set" }).imageUrl).toBe("");
  });
});

describe("cancelRaffleSchema", () => {
  it("needs a reason", () => {
    const id = "6f1c2b9e-4d2a-4c8e-9b1a-2f3e4d5c6b7a";
    expect(cancelRaffleSchema.safeParse({ raffleId: id, reason: "" }).success).toBe(false);
    expect(cancelRaffleSchema.safeParse({ raffleId: id, reason: "Store closed" }).success).toBe(true);
  });
});
