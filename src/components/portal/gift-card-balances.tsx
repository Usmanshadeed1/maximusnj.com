import { Gift } from "lucide-react";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MemberGiftCard } from "@/types/database";

/** The member's gift cards and what's left on each. Shows nothing when they have none. */
export function GiftCardBalances({ cards, className }: { cards: MemberGiftCard[]; className?: string }) {
  if (cards.length === 0) return null;
  return (
    <section className={cn("rounded-3xl bg-white p-5 shadow-sm sm:p-6", className)} aria-label="Your gift cards">
      <h2 className="flex items-center gap-2 text-base font-bold text-brand-navy-deep">
        <Gift aria-hidden className="size-5 text-brand-blue" /> Your gift {cards.length === 1 ? "card" : "cards"}
      </h2>
      <ul className="mt-3 divide-y rounded-xl border">
        {cards.map((c) => (
          <li key={c.code} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="font-mono text-[15px] font-semibold tracking-wide">{c.code}</span>
            {c.active ? (
              <span className="text-lg font-bold tabular-nums">{formatCents(c.balance_cents)}</span>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">Turned off, please ask in store</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
