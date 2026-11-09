import type { AdjustmentDirection, TransactionType } from "@/types/database";

/** Display text for each transaction type (PROJECT_SCOPE.md §8). */
export const TRANSACTION_TYPE_INFO: Record<TransactionType, { label: string; description: string }> = {
  purchase: { label: "Purchase", description: "A sale. Counts toward the member's tier." },
  refund: { label: "Refund", description: "Money returned. Lowers tier spend." },
  trade_buyin: { label: "Trade / buy-in", description: "We bought or took a trade. Doesn't count toward tier." },
  membership_payment: { label: "Membership payment", description: "A membership fee. Doesn't count toward tier." },
  adjustment: { label: "Adjustment", description: "A manual correction. Needs a note." },
};

export const TRANSACTION_TYPES = Object.keys(TRANSACTION_TYPE_INFO) as TransactionType[];

/**
 * How much a transaction moves the member's qualifying (tier) spend, in cents.
 * This mirrors the database function app_private.qualifying_cents — the database is the
 * source of truth for totals; this is only used to preview the effect in the form.
 */
export function qualifyingCents(
  type: TransactionType,
  amountCents: number,
  direction: AdjustmentDirection | null,
  countsTowardTier: boolean,
): number {
  if (type === "purchase") return amountCents;
  if (type === "refund") return -amountCents;
  if (type === "adjustment" && countsTowardTier) return direction === "credit" ? amountCents : -amountCents;
  return 0;
}
