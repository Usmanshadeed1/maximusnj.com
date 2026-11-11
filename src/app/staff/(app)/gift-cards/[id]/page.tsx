import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Gift } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatBusinessDateTime, formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireEmployee } from "@/server/auth";
import { type GiftCardEntryView, getGiftCard } from "@/server/gift-cards";
import { GiftCardActions } from "../gift-card-forms";

export const metadata: Metadata = { title: "Gift card" };

const KIND_LABEL: Record<GiftCardEntryView["kind"], string> = {
  sold: "Sold",
  added: "Money added",
  spent: "Spent",
  fixed: "Balance fixed",
  turned_off: "Turned off",
  turned_on: "Turned on",
};

export default async function GiftCardPage({ params, searchParams }: PageProps<"/staff/gift-cards/[id]">) {
  await requireEmployee();
  const [{ id }, flags] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const card = await getGiftCard(id);
  if (!card) notFound();

  return (
    <div className="w-full max-w-4xl">
      <Link href="/staff/gift-cards" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> Gift cards
      </Link>

      {flags.sold === "1" && (
        <div role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-success/30 bg-success/8 px-5 py-3.5 text-sm font-medium text-success">
          <CheckCircle2 aria-hidden className="size-4" /> Gift card sold.
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="relative bg-gradient-to-br from-brand-blue via-brand-navy to-brand-navy-deep p-6 text-white sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold tracking-[0.2em] text-brand-yellow uppercase">
                <Gift aria-hidden className="size-4" /> Gift card
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold tracking-widest">{card.code}</p>
              <p className="mt-2 text-sm text-white/75">
                {card.holderName ? (
                  <>
                    Bought by{" "}
                    <Link href={`/staff/customers/${card.holderId}`} className="font-semibold text-white underline-offset-4 hover:underline">
                      {card.holderName}
                    </Link>{" "}
                    · {card.holderNumber}
                  </>
                ) : (
                  "Not bought by a member"
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold tracking-wide text-white/60 uppercase">Balance</p>
              <p className="text-4xl font-extrabold tabular-nums sm:text-5xl">{formatCents(card.balanceCents)}</p>
              {!card.active && (
                <Badge variant="destructive" className="mt-2">
                  Turned off
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="p-5 sm:p-6">
          <GiftCardActions cardId={card.id} active={card.active} />
        </div>
      </Card>

      <Card className="mt-6 p-5 sm:p-6">
        <h2 className="text-base font-bold text-brand-navy-deep">History</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Every change, newest first, with who did it.</p>
        <ol className="mt-4 divide-y rounded-xl border">
          {card.entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3.5">
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-[15px] font-semibold">{KIND_LABEL[e.kind]}</p>
                <p className="text-sm text-muted-foreground">
                  {formatBusinessDateTime(e.createdAt)}
                  {e.storeName && ` · ${e.storeName}`}
                  {e.staffName && ` · by ${e.staffName}`}
                </p>
                {e.paidBy && <p className="text-sm text-muted-foreground">Paid by {e.paidBy} (counts toward their tier)</p>}
                {e.note && <p className="mt-0.5 text-sm">“{e.note}”</p>}
              </div>
              <div className="text-right">
                {e.amountCents !== 0 && (
                  <p className={cn("font-semibold tabular-nums", e.amountCents > 0 ? "text-success" : "text-destructive")}>
                    {e.amountCents > 0 ? "+" : "−"}
                    {formatCents(Math.abs(e.amountCents))}
                  </p>
                )}
                <p className="text-sm text-muted-foreground tabular-nums">Balance {formatCents(e.balanceAfterCents)}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
