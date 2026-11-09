"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Keyboard, Loader2, Lock, LogIn, ScanLine, ShieldCheck, Store, X, XCircle } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { TierBadge, type TierKey } from "@/components/tier-badge";
import { Button } from "@/components/ui/button";
import { BUSINESS_TIME_ZONE } from "@/lib/format";
import { type KioskOutcome, cleanMemberNumber, kioskScreen } from "@/lib/kiosk";
import { cn } from "@/lib/utils";
import { checkInAction } from "@/server/actions/kiosk";
import { StaffCredentialsForm } from "./staff-credentials-form";

const RESULT_MS = 3000;
const DEVICE_KEY = "mx_kiosk_device_id";
const TIERS: TierKey[] = ["base", "silver", "gold", "diamond"];

type Phase = { type: "ready" } | { type: "checking" } | { type: "result"; outcome: KioskOutcome };

/** Stable id for this tablet (attached to every visit). Falls back gracefully if storage is blocked. */
function readDeviceId(): string | null {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `kiosk-${crypto.randomUUID()}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/**
 * Full-screen entrance kiosk (PROJECT_SCOPE.md §6).
 * - A Bluetooth scanner "types" the number + Enter into the always-focused field.
 * - The on-screen keyboard only opens when someone taps the field (manual entry).
 * - Result: full-screen green or red for 3 seconds, then ready for the next customer.
 * - Locks after `lockMinutes` without activity; staff credentials unlock it.
 */
export function KioskScreen({ storeName, lockMinutes }: { storeName: string; lockMinutes: number }) {
  const [phase, setPhase] = useState<Phase>({ type: "ready" });
  const [value, setValue] = useState("");
  const [manual, setManual] = useState(false);
  const [locked, setLocked] = useState(false);
  const [staffPanel, setStaffPanel] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const deviceId = useRef<string | null>(null);
  const lastActivity = useRef(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const interactive = phase.type === "ready" && !locked && !staffPanel;

  const backToReady = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setPhase({ type: "ready" });
    setValue("");
    setManual(false);
  }, []);

  // Device id and activity tracking (for the idle lock).
  useEffect(() => {
    deviceId.current = readDeviceId();
    lastActivity.current = Date.now();
    const touch = () => (lastActivity.current = Date.now());
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    const idleCheck = setInterval(() => {
      if (Date.now() - lastActivity.current > lockMinutes * 60_000) setLocked(true);
    }, 15_000);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      clearInterval(idleCheck);
    };
  }, [lockMinutes]);

  // Keep the scan field focused whenever the kiosk is waiting for a card.
  useEffect(() => {
    if (!interactive) return;
    const keepFocus = () => {
      if (document.activeElement !== inputRef.current) inputRef.current?.focus({ preventScroll: true });
    };
    keepFocus();
    const timer = setInterval(keepFocus, 1000);
    return () => clearInterval(timer);
  }, [interactive]);

  const submit = async () => {
    const memberNumber = cleanMemberNumber(value);
    if (!memberNumber || phase.type !== "ready") return;
    setPhase({ type: "checking" });

    let outcome: KioskOutcome;
    try {
      outcome = await checkInAction(memberNumber, deviceId.current);
    } catch {
      outcome = { kind: "error" };
    }
    setPhase({ type: "result", outcome });
    if (outcome.kind !== "session_expired") resetTimer.current = setTimeout(backToReady, RESULT_MS);
  };

  return (
    <main className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-brand-navy-deep text-white select-none">
      <div aria-hidden className="pointer-events-none absolute -top-48 -right-40 size-[36rem] rounded-full bg-brand-blue/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-56 -left-32 size-[30rem] rounded-full bg-brand-yellow/10 blur-3xl" />

      {/* Top bar */}
      <header className="relative flex items-center justify-between gap-4 px-5 py-4 sm:px-8 sm:py-6">
        <Logo priority className="w-32 sm:w-44" />
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium sm:inline-flex">
            <Store aria-hidden className="size-4 text-brand-yellow" /> {storeName}
          </span>
          <Clock />
          <button
            type="button"
            onClick={() => setStaffPanel(true)}
            aria-label="Staff options"
            className="grid size-12 place-items-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
          >
            <ShieldCheck className="size-5" />
          </button>
        </div>
      </header>

      {/* Scan prompt */}
      <section className="relative flex flex-1 flex-col items-center justify-center px-5 pb-10 text-center">
        <span
          aria-hidden
          className="mb-8 grid size-28 place-items-center rounded-full bg-brand-yellow text-brand-navy-deep sm:size-32"
          style={{ animation: "kiosk-pulse 2.4s ease-in-out infinite" }}
        >
          <ScanLine className="size-14 sm:size-16" strokeWidth={2.2} />
        </span>
        <p className="text-sm font-semibold tracking-[0.25em] text-brand-yellow uppercase sm:text-base">Welcome to Maximus</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-balance sm:text-6xl">Scan your member card</h1>
        <p className="mt-4 text-lg text-white/70 sm:text-xl">Hold the barcode under the scanner, or type your number below.</p>

        <form
          className="mt-10 flex w-full max-w-xl flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="member-number" className="sr-only">
            Member number
          </label>
          <div className="relative flex-1">
            <input
              ref={inputRef}
              id="member-number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onPointerDown={() => setManual(true)}
              inputMode={manual ? "text" : "none"}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              placeholder="MAX000000"
              disabled={!interactive}
              className="h-16 w-full rounded-xl border-2 border-white/25 bg-white px-5 text-center font-mono text-2xl font-semibold tracking-[0.2em] text-brand-navy-deep uppercase shadow-lg placeholder:tracking-[0.2em] placeholder:text-slate-400 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/40 focus:outline-none disabled:opacity-80"
            />
            {!manual && (
              <Keyboard
                aria-hidden
                className="pointer-events-none absolute top-1/2 right-4 size-6 -translate-y-1/2 text-slate-400"
              />
            )}
          </div>
          <Button type="submit" size="kiosk" variant="accent" disabled={!interactive || !value.trim()} className="h-16 text-xl">
            Check in
          </Button>
        </form>
        {!manual && <p className="mt-3 text-sm text-white/50">Tap the box to type your number.</p>}

        <div aria-hidden className="mt-14 hidden items-center gap-3 opacity-80 sm:flex">
          {TIERS.map((tier) => (
            <TierBadge key={tier} tier={tier} tone="dark" />
          ))}
        </div>
      </section>

      {/* Checking */}
      {phase.type === "checking" && (
        <div role="status" className="fixed inset-0 z-40 grid place-items-center bg-brand-navy-deep/80 backdrop-blur-sm">
          <Loader2 aria-hidden className="size-16 animate-spin text-brand-yellow" />
          <span className="sr-only">Checking in…</span>
        </div>
      )}

      {/* Result */}
      {phase.type === "result" && <ResultScreen outcome={phase.outcome} onDismiss={backToReady} />}

      {/* Idle lock */}
      {locked && (
        <Overlay>
          <Lock aria-hidden className="mx-auto size-12 text-brand-yellow" />
          <h2 className="mt-4 text-3xl font-bold">Kiosk locked</h2>
          <p className="mt-2 text-white/70">It locked after {lockMinutes} minutes without use. A staff member can unlock it.</p>
          <div className="mt-6 rounded-2xl bg-white p-6 text-foreground">
            <StaffCredentialsForm
              intent="unlock"
              onUnlocked={() => {
                lastActivity.current = Date.now();
                setLocked(false);
                backToReady();
              }}
            />
          </div>
        </Overlay>
      )}

      {/* Staff options: exit kiosk mode */}
      {staffPanel && !locked && (
        <Overlay>
          <button
            type="button"
            onClick={() => setStaffPanel(false)}
            aria-label="Close"
            className="absolute top-5 right-5 grid size-12 place-items-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <X className="size-6" />
          </button>
          <ShieldCheck aria-hidden className="mx-auto size-12 text-brand-yellow" />
          <h2 className="mt-4 text-3xl font-bold">Staff only</h2>
          <p className="mt-2 text-white/70">Sign in to leave kiosk mode on this device.</p>
          <div className="mt-6 rounded-2xl bg-white p-6 text-foreground">
            <StaffCredentialsForm intent="exit" />
          </div>
        </Overlay>
      )}
    </main>
  );
}

function ResultScreen({ outcome, onDismiss }: { outcome: KioskOutcome; onDismiss: () => void }) {
  const screen = kioskScreen(outcome);
  const success = screen.tone === "success";
  const tier = "tier" in outcome ? (outcome.tier as TierKey) : null;
  const expired = outcome.kind === "session_expired";

  return (
    <div
      role="alert"
      onPointerDown={expired ? undefined : onDismiss}
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center text-white",
        success ? "bg-success" : "bg-destructive",
      )}
    >
      {success ? (
        <CheckCircle2 aria-hidden className="size-28 sm:size-36" strokeWidth={1.8} />
      ) : (
        <XCircle aria-hidden className="size-28 sm:size-36" strokeWidth={1.8} />
      )}
      <h2 className="mt-6 text-5xl font-extrabold tracking-tight text-balance sm:text-7xl">{screen.title}</h2>
      {success && tier && TIERS.includes(tier) && (
        <TierBadge
          tier={tier}
          label={"tierLabel" in outcome ? outcome.tierLabel : undefined}
          tone="dark"
          className="mt-6 px-5 py-2 text-base sm:text-lg"
        />
      )}
      <p className="mt-6 max-w-2xl text-2xl text-white/90 sm:text-3xl">{screen.message}</p>

      {expired ? (
        <Link
          href="/staff/login"
          className="mt-10 inline-flex h-16 items-center gap-3 rounded-xl bg-white px-8 text-xl font-bold text-foreground"
        >
          <LogIn aria-hidden className="size-6" /> Staff sign in
        </Link>
      ) : (
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-2 bg-white/25">
          <div
            className="h-full origin-left bg-white"
            style={{ animation: `kiosk-countdown ${RESULT_MS}ms linear forwards` }}
          />
        </div>
      )}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-brand-navy-deep/95 px-5 py-10 backdrop-blur">
      <div className="relative w-full max-w-md text-center">{children}</div>
    </div>
  );
}

/** Store time (New York). Rendered after mount to avoid a server/browser mismatch. */
function Clock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const format = () =>
      setTime(
        new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(
          new Date(),
        ),
      );
    format();
    const timer = setInterval(format, 15_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="min-w-20 text-right text-lg font-semibold tabular-nums text-white/90" suppressHydrationWarning>
      {time}
    </span>
  );
}
