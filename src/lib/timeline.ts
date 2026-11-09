import { formatCents, formatMonthYear } from "@/lib/format";
import { TRANSACTION_TYPE_INFO } from "@/lib/transactions";
import type { AdjustmentDirection, TransactionType } from "@/types/database";

export type TimelineKind = "visit" | "money" | "tier" | "raffle";

export type TimelineItem = { at: string; kind: TimelineKind; title: string; detail: string };

type Inputs = {
  visits: { checkedInAt: string; storeName: string; counted: boolean; qualifying: boolean }[];
  transactions: {
    type: TransactionType;
    amountCents: number;
    direction: AdjustmentDirection | null;
    occurredAt: string;
    storeName: string;
    note: string | null;
    voided: { reason: string } | null;
  }[];
  awards: { calculatedAt: string; awardedMonth: string; label: string; isCurrent: boolean; isTest: boolean }[];
  raffles: { at: string; release: string; store: string; channel: "online" | "in_store"; status: "active" | "withdrawn" | "removed"; outcome: string | null }[];
};

const RAFFLE_OUTCOME: Record<string, string> = {
  pending: "won, not told yet",
  notified: "won, told to collect",
  claimed: "won and collected",
  expired: "won, ran out of time",
  declined: "won, declined",
};

/** One newest-first list of everything that happened to a member: visits, money, tiers and raffles (§12.2). */
export function buildTimeline(input: Inputs, limit = 40): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const v of input.visits) {
    items.push({
      at: v.checkedInAt,
      kind: "visit",
      title: v.counted ? "Checked in" : "Scanned again",
      detail: `${v.storeName}${v.counted && v.qualifying ? " · counts toward tier" : ""}`,
    });
  }

  for (const t of input.transactions) {
    const label = TRANSACTION_TYPE_INFO[t.type].label;
    const sign = t.type === "refund" || t.direction === "debit" ? "−" : "";
    items.push({
      at: t.occurredAt,
      kind: "money",
      title: `${label} ${sign}${formatCents(t.amountCents)}${t.voided ? " (voided)" : ""}`,
      detail: `${t.storeName}${t.note ? ` · ${t.note}` : ""}${t.voided ? ` · voided: ${t.voided.reason}` : ""}`,
    });
  }

  for (const a of input.awards) {
    if (a.isTest) continue;
    items.push({
      at: a.calculatedAt,
      kind: "tier",
      title: `${a.label} tier for ${formatMonthYear(a.awardedMonth)}`,
      detail: a.isCurrent ? "Decided by the monthly update" : "Replaced by a later result",
    });
  }

  for (const r of input.raffles) {
    const how = r.status === "withdrawn" ? "entered, then withdrew" : r.status === "removed" ? "entry removed by staff" : (r.outcome ? (RAFFLE_OUTCOME[r.outcome] ?? "entered") : "entered");
    items.push({
      at: r.at,
      kind: "raffle",
      title: `${r.release} raffle: ${how}`,
      detail: `${r.store} · ${r.channel === "online" ? "online" : "in store"}`,
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
