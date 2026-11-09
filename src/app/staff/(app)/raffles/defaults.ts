import { nyDateString, nyTimeString } from "@/lib/timezone";
import type { RaffleRow } from "@/types/database";
import type { RaffleFieldValues } from "./raffle-fields";

/** Sensible starting values for a new raffle: opens now, closes in a week, 48 hours to collect. */
export function newRaffleDefaults(): RaffleFieldValues {
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    scope: "store",
    locationIds: [],
    pickupRule: "home_store",
    pickupLocationId: "",
    winnerCount: "1",
    opensDate: nyDateString(now),
    opensTime: nyTimeString(now),
    closesDate: nyDateString(week),
    closesTime: "18:00",
    claimHours: "48",
    channels: ["email", "portal"],
  };
}

/** The values of an existing raffle, in New York date and time, for the edit form. */
export function raffleToFieldValues(raffle: RaffleRow): RaffleFieldValues {
  const opens = new Date(raffle.opens_at);
  const closes = new Date(raffle.closes_at);
  return {
    scope: raffle.scope,
    locationIds: raffle.location_id ? [raffle.location_id] : [],
    pickupRule: raffle.pickup_rule,
    pickupLocationId: raffle.pickup_location_id ?? "",
    winnerCount: String(raffle.winner_count),
    opensDate: nyDateString(opens),
    opensTime: nyTimeString(opens),
    closesDate: nyDateString(closes),
    closesTime: nyTimeString(closes),
    claimHours: String(raffle.claim_deadline_hours),
    channels: raffle.allowed_channels,
  };
}
