"use client";

import { useState, useTransition } from "react";
import { CalendarClock, CheckCircle2, Clock, ImageIcon, MapPin, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import type { ActionState } from "@/lib/action-result";
import { formatBusinessDateTime, formatCalendarDate } from "@/lib/format";
import { enterRaffleAction, withdrawRaffleAction } from "@/server/actions/portal";
import type { PortalRaffle } from "@/server/portal";

/** One raffle: the release, when it closes, and the member's own Enter / Withdraw button. */
export function RaffleCard({ raffle, active }: { raffle: PortalRaffle; active: boolean }) {
  const [result, setResult] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const open = raffle.phase === "open";
  const upcoming = raffle.phase === "upcoming";

  const run = (action: (id: string) => Promise<ActionState>) =>
    startTransition(async () => setResult(await action(raffle.id)));

  const pickup =
    raffle.pickupRule === "home_store" ? "Your home store" : (raffle.pickup ?? raffle.store ?? "In store");

  return (
    <article className="overflow-hidden rounded-3xl border bg-white shadow-[0_1px_2px_rgba(11,31,58,0.04),0_8px_24px_rgba(11,31,58,0.06)]">
      {raffle.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- staff paste any web address, so it can't use the optimized image loader
        <img src={raffle.imageUrl} alt="" className="h-44 w-full object-cover sm:h-56" />
      ) : (
        <div className="grid h-24 place-items-center bg-gradient-to-br from-brand-blue via-brand-navy to-brand-navy-deep text-brand-yellow">
          <ImageIcon aria-hidden className="size-9 opacity-80" />
        </div>
      )}

      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
            <MapPin aria-hidden className="size-3.5" /> {raffle.store ?? "All stores"}
          </span>
          {raffle.entered && active && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-3 py-1 text-xs font-bold text-success">
              <CheckCircle2 aria-hidden className="size-3.5" /> You&apos;re entered
            </span>
          )}
        </div>

        <h3 className="mt-3 text-xl font-bold tracking-tight text-balance text-brand-navy-deep">{raffle.name}</h3>
        {raffle.description && <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-muted-foreground">{raffle.description}</p>}

        <dl className="mt-4 grid gap-2.5 text-sm">
          <div className="flex items-center gap-2.5">
            <Trophy aria-hidden className="size-4 shrink-0 text-brand-blue" />
            <dt className="sr-only">Winners</dt>
            <dd>
              <strong>{raffle.winners}</strong> {raffle.winners === 1 ? "winner" : "winners"}
            </dd>
          </div>
          <div className="flex items-center gap-2.5">
            {upcoming ? <CalendarClock aria-hidden className="size-4 shrink-0 text-brand-blue" /> : <Clock aria-hidden className="size-4 shrink-0 text-brand-blue" />}
            <dt className="sr-only">{upcoming ? "Opens" : "Closes"}</dt>
            <dd>{upcoming ? `Opens ${formatBusinessDateTime(raffle.opensAt)}` : `Closes ${formatBusinessDateTime(raffle.closesAt)}`}</dd>
          </div>
          <div className="flex items-center gap-2.5">
            <MapPin aria-hidden className="size-4 shrink-0 text-brand-blue" />
            <dt className="sr-only">Pickup</dt>
            <dd>Pay and pick up in store: {pickup}</dd>
          </div>
          {raffle.releaseDate && (
            <div className="flex items-center gap-2.5">
              <CalendarClock aria-hidden className="size-4 shrink-0 text-brand-blue" />
              <dt className="sr-only">Release date</dt>
              <dd>Releases {formatCalendarDate(raffle.releaseDate)}</dd>
            </div>
          )}
        </dl>

        <div className="mt-5">
          <FormMessage state={result} className="mb-3" />
          {raffle.entered ? (
            open || upcoming ? (
              <Button variant="outline" size="lg" className="w-full" disabled={pending} onClick={() => run(withdrawRaffleAction)}>
                {pending ? "Working…" : "Withdraw my entry"}
              </Button>
            ) : (
              <p className="rounded-xl bg-secondary/70 px-4 py-3 text-center text-sm font-medium">
                Entries are closed. We&apos;ll let you know if you win.
              </p>
            )
          ) : raffle.enteredOther ? (
            <p className="rounded-xl bg-muted px-4 py-3 text-center text-sm text-muted-foreground">
              You&apos;ve entered another store&apos;s raffle for this release. You can only enter one.
            </p>
          ) : raffle.removed ? (
            <p className="rounded-xl bg-muted px-4 py-3 text-center text-sm text-muted-foreground">
              Please ask a team member in store about your entry.
            </p>
          ) : open ? (
            <Button size="lg" variant="accent" className="w-full text-base" disabled={pending} onClick={() => run(enterRaffleAction)}>
              {pending ? "Entering…" : "Enter the raffle"}
            </Button>
          ) : (
            <p className="rounded-xl bg-muted px-4 py-3 text-center text-sm text-muted-foreground">
              {upcoming ? `You can enter from ${formatBusinessDateTime(raffle.opensAt)}.` : "This raffle is closed."}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
