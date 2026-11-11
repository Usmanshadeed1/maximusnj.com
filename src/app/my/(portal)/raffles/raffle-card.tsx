"use client";

import { useState, useTransition } from "react";
import { CalendarClock, CheckCircle2, Clock, Frown, Hourglass, ImageIcon, MapPin, PartyPopper, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoicePicker } from "@/components/raffles/choice-picker";
import { FormMessage } from "@/components/ui/form";
import type { ActionState } from "@/lib/action-result";
import { formatBusinessDateTime, formatCalendarDate } from "@/lib/format";
import { enterRaffleAction, withdrawRaffleAction } from "@/server/actions/portal";
import type { PortalRaffle } from "@/server/portal";

/** The member's own result after the draw. Never a position, never anyone else. */
function ResultPanel({ raffle }: { raffle: PortalRaffle }) {
  const result = raffle.result;
  if (!result) return null;
  const pickup = raffle.pickup ?? raffle.store ?? "your Maximus store";

  if (result.state === "won") {
    return (
      <div role="status" className="rounded-2xl bg-gradient-to-br from-brand-yellow to-amber-300 p-5 text-brand-navy-deep">
        <p className="flex items-center gap-2 text-xl font-extrabold">
          <PartyPopper aria-hidden className="size-6" /> You won!
        </p>
        {result.product && (
          <p className="mt-1 text-lg font-bold">{result.product}</p>
        )}
        <p className="mt-2 text-[15px] font-medium">
          Come to <strong>{pickup}</strong> to pay and pick it up
          {result.deadline_at ? <> by <strong>{formatBusinessDateTime(result.deadline_at)}</strong></> : ""}. Bring your member card.
        </p>
        <p className="mt-2 text-sm">If you can&apos;t make it, please tell the store so someone else can have your spot.</p>
      </div>
    );
  }
  const plain: Record<string, { icon: typeof Hourglass; text: string; tone: string }> = {
    waiting: { icon: Hourglass, text: "The draw is done. We'll contact you if you're picked. Keep an eye on this page.", tone: "bg-secondary/70" },
    collected: { icon: PackageCheck, text: "You collected your prize. Enjoy!", tone: "bg-success/12 text-success" },
    expired: { icon: Frown, text: "The time to collect ended, so your spot went to someone else.", tone: "bg-muted" },
    declined: { icon: Frown, text: "You passed on this spot. Thanks for letting us know.", tone: "bg-muted" },
    not_selected: { icon: Frown, text: "You weren't selected this time. Thanks for entering. See you at the next one!", tone: "bg-muted" },
  };
  const item = result.state === "collected" && result.product
    ? { ...plain.collected, text: `You collected ${result.product}. Enjoy!` }
    : plain[result.state];
  if (!item) return null;
  const Icon = item.icon;
  return (
    <p role="status" className={`flex items-start gap-2.5 rounded-2xl px-4 py-3.5 text-sm font-medium ${item.tone}`}>
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" /> {item.text}
    </p>
  );
}

/** One raffle: the release, when it closes, and the member's own Enter / Withdraw button. */
type EnterFn = (id: string, choices?: string[]) => Promise<ActionState>;

export function RaffleCard({
  raffle,
  active,
  onEnter = enterRaffleAction,
  onWithdraw = withdrawRaffleAction,
}: {
  raffle: PortalRaffle;
  active: boolean;
  /** The kiosk passes its own actions (the member is checked in there, not signed in). */
  onEnter?: EnterFn;
  onWithdraw?: (id: string) => Promise<ActionState>;
}) {
  const [result, setResult] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const [choices, setChoices] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const hasProducts = raffle.products.length > 0;
  const open = raffle.phase === "open";
  const upcoming = raffle.phase === "upcoming";

  const run = (action: (id: string, choices?: string[]) => Promise<ActionState>, picked: string[] = []) =>
    startTransition(async () => {
      const outcome = await action(raffle.id, picked);
      setResult(outcome);
      if (outcome.ok) {
        setPicking(false);
        setChoices([]);
      }
    });

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

        {raffle.entered && raffle.myChoices.length > 0 && (
          <div className="mt-4 rounded-2xl bg-secondary/60 px-4 py-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Your choices</p>
            <ol className="mt-1.5 flex flex-col gap-1 text-[15px]">
              {raffle.myChoices.map((name, i) => (
                <li key={name}>
                  <span className="font-bold text-brand-blue">{i + 1}.</span> {name}
                </li>
              ))}
            </ol>
          </div>
        )}
        {!raffle.entered && hasProducts && (open || upcoming) && !picking && (
          <div className="mt-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Products in this raffle</p>
            <p className="mt-1 text-[15px]">{raffle.products.map((p) => p.name).join(" · ")}</p>
          </div>
        )}

        <div className="mt-5">
          <FormMessage state={result} className="mb-3" />
          {raffle.result ? (
            <ResultPanel raffle={raffle} />
          ) : raffle.entered ? (
            open || upcoming ? (
              <Button variant="outline" size="lg" className="w-full" disabled={pending} onClick={() => run(onWithdraw)}>
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
          ) : open && hasProducts ? (
            picking ? (
              <div className="flex flex-col gap-4">
                <ChoicePicker
                  products={raffle.products.map((p) => ({ id: p.id, name: p.name, description: p.description, imageUrl: p.image_url }))}
                  value={choices}
                  onChange={setChoices}
                  disabled={pending}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" size="lg" disabled={pending} onClick={() => { setPicking(false); setChoices([]); }}>
                    Cancel
                  </Button>
                  <Button size="lg" variant="accent" disabled={pending || choices.length === 0} onClick={() => run(onEnter, choices)}>
                    {pending ? "Entering…" : "Enter"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="lg" variant="accent" className="w-full text-base" onClick={() => setPicking(true)}>
                Choose products and enter
              </Button>
            )
          ) : open ? (
            <Button size="lg" variant="accent" className="w-full text-base" disabled={pending} onClick={() => run(onEnter)}>
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
