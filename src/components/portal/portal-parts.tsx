import { Gem, ScanLine, ShoppingBag, Undo2 } from "lucide-react";
import { MemberCard } from "@/components/customers/member-card";
import { formatBusinessDate, formatBusinessDateTime, formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PortalData } from "@/server/portal";

/** The member's card on screen: the same card as the printed one (logo and barcode). */
export function PortalMemberCard({ data, className }: { data: PortalData; className?: string }) {
  return (
    <section aria-label="Your membership" className={cn("mx-auto w-full max-w-md", className)}>
      <MemberCard name={`${data.firstName} ${data.lastName}`} memberNumber={data.memberNumber} tier={{ key: data.tier.key, label: data.tier.label }} />
      <p className="mt-3 text-center text-sm text-muted-foreground">Member since {formatBusinessDate(data.memberSince)}</p>
    </section>
  );
}

type Activity =
  | { kind: "visit"; at: string; store: string; counts: boolean }
  | { kind: "purchase" | "refund"; at: string; store: string; amountCents: number };

/** Visits and purchases/refunds together, newest first. */
export function mergeActivity(data: PortalData): Activity[] {
  const items: Activity[] = [
    ...data.visits.map((v) => ({ kind: "visit" as const, at: v.at, store: v.store, counts: v.counts })),
    ...data.purchases.map((p) => ({ kind: p.type, at: p.at, store: p.store, amountCents: p.amountCents })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

export function ActivityList({ items, empty }: { items: Activity[]; empty: string }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-muted/70 px-4 py-8 text-center text-sm text-muted-foreground">
        <Gem aria-hidden className="size-6 text-brand-blue/70" />
        {empty}
      </div>
    );
  }
  return (
    <ul className="divide-y">
      {items.map((item, index) => {
        const Icon = item.kind === "visit" ? ScanLine : item.kind === "refund" ? Undo2 : ShoppingBag;
        const title = item.kind === "visit" ? "Store visit" : item.kind === "refund" ? "Refund" : "Purchase";
        return (
          <li key={`${item.at}-${index}`} className="flex items-center gap-3 py-3.5">
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-full",
                item.kind === "visit" ? "bg-secondary text-brand-blue" : "bg-brand-yellow/25 text-brand-navy-deep",
              )}
            >
              <Icon aria-hidden className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">{title}</p>
              <p className="truncate text-sm text-muted-foreground">
                {item.store} · {formatBusinessDateTime(item.at)}
              </p>
            </div>
            {item.kind === "visit" ? (
              item.counts ? (
                <span className="shrink-0 rounded-full bg-success/12 px-2.5 py-1 text-xs font-semibold text-success">Counted</span>
              ) : null
            ) : (
              <span
                className={cn(
                  "shrink-0 text-[15px] font-bold tabular-nums",
                  item.kind === "refund" ? "text-muted-foreground" : "text-brand-navy-deep",
                )}
              >
                {item.kind === "refund" ? "−" : ""}
                {formatCents(item.amountCents)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
