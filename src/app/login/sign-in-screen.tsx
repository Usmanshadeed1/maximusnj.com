"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, KeyRound, Keyboard, Loader2, ScanLine } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { TierBadge, type TierKey } from "@/components/tier-badge";
import { Button } from "@/components/ui/button";
import { cleanMemberNumber, isPlausibleMemberNumber } from "@/lib/kiosk";
import { homePinSignInAction } from "@/server/actions/home-pin";
import { KioskPin } from "@/app/staff/kiosk/kiosk-pin";

const TIERS: TierKey[] = ["base", "silver", "gold", "diamond"];

type Phase =
  | { type: "ready" }
  | { type: "checking" }
  /** `card` is the member number, or null for "Sign in with my PIN". */
  | { type: "pin"; card: string | null; error: string | null; attempt: number };

/**
 * The kiosk-style sign-in screen. Everyone signs in here: card + PIN, or the PIN alone.
 * The PIN decides who you are (customer → member page, staff → dashboard). No visit is counted.
 */
export function SignInScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ type: "ready" });
  const [value, setValue] = useState("");
  const [cardError, setCardError] = useState<string | null>(null);

  const askPin = (card: string | null) => setPhase({ type: "pin", card, error: null, attempt: 0 });

  const submitCard = () => {
    const card = cleanMemberNumber(value);
    if (!isPlausibleMemberNumber(card)) {
      setCardError("Please check your member number, e.g. MAX000123.");
      return;
    }
    setCardError(null);
    askPin(card);
  };

  const signIn = async (card: string | null, pin: string, attempt: number) => {
    setPhase({ type: "checking" });
    try {
      const outcome = await homePinSignInAction(pin, card);
      if (outcome.to) {
        // Signed in: keep the spinner showing while the next page opens.
        router.replace(outcome.to);
        router.refresh();
        return;
      }
      setPhase({ type: "pin", card, error: outcome.error, attempt: attempt + 1 });
    } catch {
      setPhase({ type: "pin", card, error: "Something went wrong. Please try again.", attempt: attempt + 1 });
    }
  };

  return (
    <main className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-brand-navy-deep text-white">
      <div aria-hidden className="pointer-events-none absolute -top-48 -right-40 size-[36rem] rounded-full bg-brand-blue/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-56 -left-32 size-[30rem] rounded-full bg-brand-yellow/10 blur-3xl" />

      <header className="relative flex items-center justify-between gap-4 px-5 py-4 sm:px-8 sm:py-6">
        <Logo priority className="w-32 sm:w-44" />
        <Link
          href="/"
          className="inline-flex h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold text-white/85 transition hover:bg-white/20 hover:text-white"
        >
          <ArrowLeft aria-hidden className="size-4" /> Back
        </Link>
      </header>

      <section className="relative flex flex-1 flex-col items-center justify-center px-5 pb-10 text-center">
        <span
          aria-hidden
          className="mb-8 grid size-24 place-items-center rounded-full bg-brand-yellow text-brand-navy-deep sm:size-28"
          style={{ animation: "kiosk-pulse 2.4s ease-in-out infinite" }}
        >
          <ScanLine className="size-12 sm:size-14" strokeWidth={2.2} />
        </span>
        <p className="text-sm font-semibold tracking-[0.25em] text-brand-yellow uppercase sm:text-base">Welcome to Maximus</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-balance sm:text-6xl">Scan your member card</h1>
        <p className="mt-4 text-lg text-white/70 sm:text-xl">Scan the barcode, or type your number below.</p>

        <form
          className="mt-10 flex w-full max-w-xl flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            submitCard();
          }}
        >
          <label htmlFor="member-number" className="sr-only">
            Member number
          </label>
          <div className="relative flex-1">
            <input
              id="member-number"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (cardError) setCardError(null);
              }}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              placeholder="MAX000000"
              aria-invalid={Boolean(cardError)}
              aria-describedby={cardError ? "card-error" : undefined}
              className="h-16 w-full rounded-xl border-2 border-white/25 bg-white px-5 text-center font-mono text-2xl font-semibold tracking-[0.2em] text-brand-navy-deep uppercase shadow-lg placeholder:tracking-[0.2em] placeholder:text-slate-400 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/40 focus:outline-none"
            />
            <Keyboard aria-hidden className="pointer-events-none absolute top-1/2 right-4 size-6 -translate-y-1/2 text-slate-400" />
          </div>
          <Button type="submit" size="kiosk" variant="accent" disabled={!value.trim()} className="h-16 text-xl">
            Next
          </Button>
        </form>
        <p id="card-error" role="alert" className="mt-3 min-h-5 text-sm font-semibold text-red-300">
          {cardError}
        </p>

        <div className="mt-5 flex w-full max-w-xl items-center gap-4 text-white/50" aria-hidden>
          <span className="h-px flex-1 bg-white/20" />
          <span className="text-sm font-semibold tracking-widest uppercase">or</span>
          <span className="h-px flex-1 bg-white/20" />
        </div>
        <Button
          type="button"
          size="kiosk"
          variant="outline"
          onClick={() => askPin(null)}
          className="mt-6 h-16 w-full max-w-xl border-2 border-white/40 bg-white/10 text-xl text-white hover:bg-white/20 hover:text-white"
        >
          <KeyRound aria-hidden className="size-6" /> Sign in with my PIN
        </Button>

        <Link href="/login/forgot" className="mt-8 text-base font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline">
          Forgot your PIN or card?
        </Link>

        <div aria-hidden className="mt-10 hidden items-center gap-3 opacity-80 sm:flex">
          {TIERS.map((tier) => (
            <TierBadge key={tier} tier={tier} tone="dark" />
          ))}
        </div>
      </section>

      {phase.type === "checking" && (
        <div role="status" className="fixed inset-0 z-40 grid place-items-center bg-brand-navy-deep/80 backdrop-blur-sm">
          <Loader2 aria-hidden className="size-16 animate-spin text-brand-yellow" />
          <span className="sr-only">Signing in…</span>
        </div>
      )}

      {phase.type === "pin" && (
        <KioskPin
          key={`${phase.card ?? "pin"}-${phase.attempt}`}
          error={phase.error}
          attempt={phase.attempt}
          onSubmit={(pin) => void signIn(phase.card, pin, phase.attempt)}
          onCancel={() => setPhase({ type: "ready" })}
        />
      )}
    </main>
  );
}
