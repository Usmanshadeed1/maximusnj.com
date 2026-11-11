import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Gift, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { formatCents } from "@/lib/format";
import { requireEmployee } from "@/server/auth";
import { getGiftCards } from "@/server/gift-cards";

export const metadata: Metadata = { title: "Gift cards" };

export default async function GiftCardsPage({ searchParams }: PageProps<"/staff/gift-cards">) {
  await requireEmployee();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const cards = await getGiftCards(query);

  return (
    <div className="w-full max-w-4xl">
      <PageHeader
        title="Gift cards"
        description="Find a card to record spending or add money."
        actions={
          <Link href="/staff/gift-cards/new" className={buttonVariants({ size: "lg" })}>
            <Plus aria-hidden /> Sell a gift card
          </Link>
        }
      />

      <form action="/staff/gift-cards" className="mb-5 flex gap-2">
        <label htmlFor="q" className="sr-only">
          Search gift cards
        </label>
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input id="q" name="q" defaultValue={query} placeholder="Gift card number, member name or member number" className="h-12 pl-11 text-base" autoComplete="off" />
        </div>
        <Button type="submit" size="lg" variant="outline">
          Search
        </Button>
      </form>

      {cards.length === 0 ? (
        <EmptyState
          icon={Gift}
          title={query ? "No gift card found" : "No gift cards yet"}
          description={query ? "Check the number, or sell a new card." : "Sold gift cards show up here."}
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y">
            {cards.map((c) => (
              <li key={c.id}>
                <Link href={`/staff/gift-cards/${c.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-muted/50">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-brand-blue">
                    <Gift aria-hidden className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[15px] font-semibold tracking-wide">{c.code}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {c.holderName ? `${c.holderName} · ${c.holderNumber}` : "Not connected to a member"}
                    </p>
                  </div>
                  {!c.active && <Badge variant="destructive">Off</Badge>}
                  <p className="text-lg font-bold tabular-nums">{formatCents(c.balanceCents)}</p>
                  <ChevronRight aria-hidden className="size-5 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
