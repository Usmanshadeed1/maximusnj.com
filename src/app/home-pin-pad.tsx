"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PinEntry } from "@/components/ui/pin-entry";
import { PIN_MAX, PIN_MIN } from "@/lib/validation/portal";
import { homePinSignInAction } from "@/server/actions/home-pin";

/** The kiosk-style PIN pad on the home page. The PIN decides who you are. */
export function HomePinPad() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [pending, startTransition] = useTransition();
  const ready = pin.length >= PIN_MIN && !pending;

  const submit = () => {
    if (!ready) return;
    const typed = pin;
    startTransition(async () => {
      const outcome = await homePinSignInAction(typed);
      // Only comes back when the PIN did not sign anyone in (success moves to the next page).
      if (outcome?.error) {
        setError(outcome.error);
        setPin("");
        setShake(true);
      }
    });
  };

  useEffect(() => {
    if (!shake) return;
    const timer = setTimeout(() => setShake(false), 450);
    return () => clearTimeout(timer);
  }, [shake]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") submit();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <div className="w-full max-w-md">
      <p className="min-h-7 text-base sm:text-lg" role="alert">
        {error ? <span className="font-semibold text-red-300">{error}</span> : <span className="text-white/70">Then tap Sign in.</span>}
      </p>
      <div className="mt-4 rounded-3xl bg-white p-5 text-foreground shadow-2xl">
        <PinEntry
          value={pin}
          onChange={(next) => {
            setPin(next);
            if (error) setError(null);
          }}
          minLength={PIN_MIN}
          maxLength={PIN_MAX}
          invalid={shake}
          disabled={pending}
          label="PIN"
        />
      </div>
      <Button variant="accent" size="kiosk" disabled={!ready} onClick={submit} className="mt-4 h-14 w-full text-lg">
        {pending ? (
          <>
            <Loader2 aria-hidden className="size-6 animate-spin" /> Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </div>
  );
}
