import Link from "next/link";
import { Gem, ReceiptText, ScanLine, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatBusinessDateTime } from "@/lib/format";
import type { TimelineItem, TimelineKind } from "@/lib/timeline";
import { cn } from "@/lib/utils";
import type { MemberRaffle } from "@/server/member-raffles";

const ICONS: Record<TimelineKind, typeof ScanLine> = { visit: ScanLine, money: ReceiptText, tier: Gem, raffle: Ticket };
const TONES: Record<TimelineKind, string> = {
  visit: "bg-secondary text-brand-blue",
  money: "bg-brand-yellow/25 text-brand-navy-deep",
  tier: "bg-sky-100 text-sky-800",
  raffle: "bg-emerald-100 text-emerald-800",
};

/** Everything that happened to this member, newest first (visits, money, tiers, raffles). */
export function ActivityTimelineCard({ items }: { items: TimelineItem[] }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-base font-bold text-brand-navy-deep">Activity timeline</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Everything in one list, newest first.</p>
      {items.length === 0 ? (
        <p className="mt-4 rounded-lg bg-muted/60 px-4 py-4 text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ol className="mt-4 flex flex-col">
          {items.map((item, index) => {
            const Icon = ICONS[item.kind];
            return (
              <li key={`${item.at}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
                {index < items.length - 1 && <span aria-hidden className="absolute top-9 bottom-0 left-[17px] w-px bg-border" />}
                <span className={cn("z-10 grid size-9 shrink-0 place-items-center rounded-full", TONES[item.kind])}>
                  <Icon aria-hidden className="size-4" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-[15px] font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatBusinessDateTime(item.at)}
                    {item.detail ? ` · ${item.detail}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

const OUTCOME_LABEL: Record<string, string> = {
  pending: "Won · not told yet",
  notified: "Won · told to collect",
  claimed: "Won · collected",
  expired: "Won · ran out of time",
  declined: "Won · declined",
};

/** The raffles this member entered, and how each one went. */
export function RaffleHistoryCard({ raffles }: { raffles: MemberRaffle[] }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-base font-bold text-brand-navy-deep">Raffle history</h2>
      {raffles.length === 0 ? (
        <p className="mt-3 rounded-lg bg-muted/60 px-4 py-4 text-sm text-muted-foreground">No raffle entries yet.</p>
      ) : (
        <ul className="mt-2 divide-y">
          {raffles.map((r) => (
            <li key={r.entryId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-3">
              <div className="min-w-0">
                <Link href={`/staff/raffles/${r.releaseId}/${r.raffleId}`} className="text-[15px] font-semibold hover:underline">
                  {r.release}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {r.store} · {r.channel === "online" ? "Entered online" : "Entered in store"} · {formatBusinessDateTime(r.at)}
                </p>
              </div>
              {r.status === "withdrawn" ? (
                <Badge variant="outline">Withdrew</Badge>
              ) : r.status === "removed" ? (
                <Badge variant="destructive">Removed</Badge>
              ) : r.outcome ? (
                <Badge variant={r.outcome === "claimed" ? "success" : r.outcome === "expired" || r.outcome === "declined" ? "destructive" : "accent"}>
                  {OUTCOME_LABEL[r.outcome]}
                </Badge>
              ) : (
                <Badge variant="secondary">Entered</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
