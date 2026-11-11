"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, Gift, Info, Loader2, LogOut, Sparkles, Ticket, Trophy } from "lucide-react";
import { MemberCard } from "@/components/customers/member-card";
import { RaffleCard } from "@/app/my/(portal)/raffles/raffle-card";
import { TierBadge } from "@/components/tier-badge";
import { TierProgress } from "@/components/tier-progress";
import { Button } from "@/components/ui/button";
import { formatCents, formatMonthYear } from "@/lib/format";
import { type KioskMemberView, kioskMemberEnterAction, kioskMemberViewAction, kioskMemberWithdrawAction } from "@/server/actions/kiosk-member";

/** Seconds without touching the screen before the kiosk goes back to the start for the next person. */
const IDLE_SECONDS = 30;

/**
 * After a check-in, the member sees their own page on the kiosk: tier, progress, this month and
 * raffles. Never their email, phone or purchases. "Done" (or 30 seconds without a touch) checks them out.
 */
export function KioskMemberPage({
  pass,
  firstName,
  alreadyIn,
  onDone,
}: {
  pass: string;
  firstName: string;
  alreadyIn: boolean;
  onDone: () => void;
}) {
  const [view, setView] = useState<KioskMemberView | null | "loading">("loading");
  const [secondsLeft, setSecondsLeft] = useState(IDLE_SECONDS);
  const lastTouch = useRef(0);

  const load = useCallback(async () => {
    const next = await kioskMemberViewAction(pass);
    setView(next);
  }, [pass]);

  useEffect(() => {
    let alive = true;
    void kioskMemberViewAction(pass).then((next) => {
      if (alive) setView(next);
    });
    return () => {
      alive = false;
    };
  }, [pass]);

  // Check out automatically after a short time without anyone touching the screen.
  useEffect(() => {
    lastTouch.current = Date.now();
    const touch = () => (lastTouch.current = Date.now());
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    window.addEventListener("scroll", touch, true);
    const timer = setInterval(() => {
      const left = IDLE_SECONDS - Math.floor((Date.now() - lastTouch.current) / 1000);
      setSecondsLeft(Math.max(0, left));
      if (left <= 0) onDone();
    }, 1000);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      window.removeEventListener("scroll", touch, true);
      clearInterval(timer);
    };
  }, [onDone]);

  const enter = async (raffleId: string, choices: string[] = []) => {
    const result = await kioskMemberEnterAction(pass, raffleId, choices);
    if (result.ok) await load();
    return result;
  };
  const withdraw = async (raffleId: string) => {
    const result = await kioskMemberWithdrawAction(pass, raffleId);
    if (result.ok) await load();
    return result;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-muted text-foreground">
      {/* Header */}
      <header className="bg-brand-navy-deep text-white shadow-lg">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div className="min-w-0">
            <p className="text-3xl font-extrabold tracking-tight sm:text-4xl">Welcome, {firstName}!</p>
            <p className={alreadyIn ? "mt-1 flex items-center gap-2 text-base text-brand-yellow" : "mt-1 flex items-center gap-2 text-base text-emerald-300"}>
              <CheckCircle2 aria-hidden className="size-5" />
              {alreadyIn ? "You're already checked in today." : "You're checked in. Enjoy your visit."}
            </p>
          </div>
          <Button size="kiosk" variant="accent" onClick={onDone} className="h-16 shrink-0 text-xl">
            <LogOut aria-hidden className="size-6" /> Done
          </Button>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-5 py-6 sm:px-8">
          {view === "loading" ? (
            <div className="grid place-items-center py-20">
              <Loader2 aria-hidden className="size-12 animate-spin text-brand-blue" />
              <span className="sr-only">Loading your page…</span>
            </div>
          ) : view === null ? (
            <p className="flex items-center gap-2 rounded-2xl bg-white p-6 text-lg">
              <Info aria-hidden className="size-6 text-brand-blue" /> Your page can&apos;t be shown right now. You are checked in.
            </p>
          ) : (
            <>
              <MemberSummary view={view} />
              <section aria-labelledby="kiosk-raffles" className="flex flex-col gap-4">
                <h2 id="kiosk-raffles" className="flex items-center gap-2 text-xl font-bold text-brand-navy-deep">
                  <Ticket aria-hidden className="size-6 text-brand-blue" /> Raffles
                </h2>
                {view.raffles.length === 0 ? (
                  <p className="rounded-2xl bg-white p-5 text-base text-muted-foreground">No raffles are open right now.</p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {view.raffles.map((r) => (
                      <RaffleCard key={r.id} raffle={r} active onEnter={enter} onWithdraw={withdraw} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      <footer className="border-t bg-white">
        <p className="mx-auto flex w-full max-w-4xl items-center gap-2 px-5 py-3 text-sm text-muted-foreground sm:px-8" aria-live="polite">
          <Clock aria-hidden className="size-4" />
          {secondsLeft > 10 ? "Tap Done when you're finished." : `Closing in ${secondsLeft} seconds. Touch the screen to stay.`}
        </p>
      </footer>
    </div>
  );
}

function MemberSummary({ view }: { view: KioskMemberView }) {
  const { projection, names } = view;
  const { progress } = projection;
  const next = progress.nextTier;
  const ratio = progress.targetCents ? progress.scoreCents / progress.targetCents : 0;

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div>
        <MemberCard name={`${view.firstName} ${view.lastName}`} memberNumber={view.memberNumber} tier={{ key: view.tier, label: view.tierLabel }} />
        <p className="mt-3 text-center text-sm text-muted-foreground">Your tier for {formatMonthYear(view.month)}</p>
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-sm">
        {next ? (
          <>
            <p className="text-lg font-semibold">
              {formatCents(Math.max(0, progress.scoreCents))} of {formatCents(progress.targetCents ?? 0)} toward{" "}
              <span className="text-brand-blue">{names[next]}</span>
            </p>
            <TierProgress value={ratio} label={`Progress toward ${names[next]}`} className="mt-3 h-5" />
            {progress.missingCents !== null && progress.missingCents > 0 && (
              <p className="mt-3 flex items-start gap-2 text-base">
                <Sparkles aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-blue" />
                Spend {formatCents(progress.missingCents)} more this month to reach {names[next]}.
              </p>
            )}
          </>
        ) : (
          <p className="flex items-center gap-2 text-lg font-semibold">
            <Trophy aria-hidden className="size-6 text-brand-blue" /> You&apos;re at the top tier!
          </p>
        )}
        <dl className="mt-5 grid grid-cols-3 gap-3 border-t pt-4">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Spent this month</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums">{formatCents(projection.thisMonth.spendCents)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Visit days</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums">{projection.thisMonth.visits}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">On track for</dt>
            <dd className="mt-1">
              <TierBadge tier={projection.tier} label={projection.label} />
            </dd>
          </div>
        </dl>
        {view.benefits && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-secondary/60 px-4 py-3 text-sm">
            <Gift aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-blue" />
            <span className="whitespace-pre-line">{view.benefits}</span>
          </p>
        )}
      </div>
    </section>
  );
}
