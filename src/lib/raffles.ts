import type { RaffleChannel, RaffleScope, RaffleStatus } from "@/types/database";

/** What a raffle is right now. The same rule the database uses to accept or refuse an entry. */
export type RafflePhase = "draft" | "upcoming" | "open" | "closed" | "drawn" | "completed" | "cancelled";

export function rafflePhase(
  status: RaffleStatus,
  opensAt: string | Date,
  closesAt: string | Date,
  now: Date = new Date(),
): RafflePhase {
  if (status === "draft" || status === "drawn" || status === "completed" || status === "cancelled") return status;
  if (now < new Date(opensAt)) return "upcoming";
  if (now >= new Date(closesAt)) return "closed";
  return "open";
}

export const PHASE_INFO: Record<
  RafflePhase,
  { label: string; variant: "success" | "secondary" | "accent" | "outline" | "destructive" | "default" }
> = {
  draft: { label: "Draft", variant: "outline" },
  upcoming: { label: "Opens soon", variant: "accent" },
  open: { label: "Open for entries", variant: "success" },
  closed: { label: "Closed", variant: "secondary" },
  drawn: { label: "Drawn", variant: "default" },
  completed: { label: "Completed", variant: "default" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

export const CHANNEL_LABELS: Record<RaffleChannel, string> = { email: "Email", portal: "Member page" };

export const SCOPE_LABELS: Record<RaffleScope, string> = { store: "Store raffle", company: "All stores" };

/** "Email and Member page", "Email", or "None (staff call the winners)". */
export function describeChannels(channels: RaffleChannel[]): string {
  if (channels.length === 0) return "None (staff call the winners)";
  return channels.map((c) => CHANNEL_LABELS[c]).join(" and ");
}
