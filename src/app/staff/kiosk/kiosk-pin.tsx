"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PinEntry } from "@/components/ui/pin-entry";
import { PIN_MAX, PIN_MIN } from "@/lib/validation/portal";

/** Seconds of no touching before the PIN screen goes away (so the next person never sees a half-typed PIN). */
const PIN_IDLE_SECONDS = 30;

/**
 * Shown after the card is scanned, for members who have set a PIN. Nothing about the member is
 * shown here. `error` is a message about the last wrong try; `attempt` is how many wrong tries so far.
 */
export function KioskPin({
  error,
  attempt,
  onSubmit,
  onCancel,
}: {
  error: string | null;
  attempt: number;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}) {
  // The pad starts empty every time (it is re-created after each try). After a wrong PIN it shakes once.
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(attempt > 0);

  useEffect(() => {
    if (!shake) return;
    const timer = setTimeout(() => setShake(false), 450);
    return () => clearTimeout(timer);
  }, [shake]);

  // Walk away → back to the scan screen.
  useEffect(() => {
    const timer = setTimeout(onCancel, PIN_IDLE_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [pin, onCancel]);

  const ready = pin.length >= PIN_MIN;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && ready) onSubmit(pin);
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ready, pin, onSubmit, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-brand-navy-deep/97 px-5 py-8 backdrop-blur">
      <div className="w-full max-w-md text-center text-white">
        <KeyRound aria-hidden className="mx-auto size-12 text-brand-yellow" />
        <h2 className="mt-3 text-4xl font-extrabold tracking-tight">Enter your PIN</h2>
        <p className="mt-2 min-h-7 text-lg" role="alert">
          {error ? <span className="font-semibold text-red-300">{error}</span> : <span className="text-white/70">Then tap Done.</span>}
        </p>

        <div className="mt-5 rounded-3xl bg-white p-5 text-foreground shadow-2xl sm:p-7">
          <PinEntry value={pin} onChange={setPin} minLength={PIN_MIN} maxLength={PIN_MAX} size="kiosk" invalid={shake} label="PIN" />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            size="kiosk"
            onClick={onCancel}
            className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            Cancel
          </Button>
          <Button variant="accent" size="kiosk" disabled={!ready} onClick={() => onSubmit(pin)}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
