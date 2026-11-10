"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PinEntry } from "@/components/ui/pin-entry";
import { PIN_MAX, PIN_MIN } from "@/lib/validation/portal";

/**
 * The customer chooses a PIN on the number pad, typing it twice. Staff turn the screen to them,
 * so staff never need to know it. The PIN is never shown back once chosen.
 * With `name`, the chosen PIN is sent with the surrounding form.
 */
export function PinCapture({
  name,
  value,
  onChange,
  startLabel = "Let the customer choose a PIN",
}: {
  name?: string;
  value: string;
  onChange: (pin: string) => void;
  startLabel?: string;
}) {
  const [step, setStep] = useState<"idle" | "enter" | "confirm">("idle");
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep("idle");
    setFirst("");
    setSecond("");
  };

  return (
    <div>
      {name && <input type="hidden" name={name} value={value} />}

      {step === "idle" &&
        (value ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="inline-flex items-center gap-2 text-[15px] font-semibold text-success">
              <CheckCircle2 aria-hidden className="size-5" /> PIN chosen (hidden)
            </p>
            <Button variant="outline" size="sm" onClick={() => setStep("enter")}>
              Change
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onChange("")}>
              Remove
            </Button>
          </div>
        ) : (
          <Button variant="outline" onClick={() => { setError(null); setStep("enter"); }}>
            <KeyRound aria-hidden /> {startLabel}
          </Button>
        ))}

      {step !== "idle" && (
        <div className="rounded-2xl bg-muted/60 p-4 sm:p-6">
          <p className="text-center text-lg font-bold text-brand-navy-deep">
            {step === "enter" ? "Customer: choose your PIN" : "Type it again to confirm"}
          </p>
          <p className="mt-1 mb-5 text-center text-sm text-muted-foreground">
            {step === "enter" ? `Numbers only, ${PIN_MIN} to ${PIN_MAX} of them.` : "Make sure it matches."}
          </p>
          {error && (
            <p role="alert" className="mb-4 text-center text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          {step === "enter" ? (
            <PinEntry key="enter" value={first} onChange={setFirst} minLength={PIN_MIN} maxLength={PIN_MAX} label="New PIN" />
          ) : (
            <PinEntry key="confirm" value={second} onChange={setSecond} minLength={PIN_MIN} maxLength={PIN_MAX} label="Confirm PIN" />
          )}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                if (step === "confirm") {
                  setSecond("");
                  setStep("enter");
                } else reset();
              }}
            >
              {step === "confirm" ? "Back" : "Cancel"}
            </Button>
            {step === "enter" ? (
              <Button size="lg" disabled={first.length < PIN_MIN} onClick={() => setStep("confirm")}>
                Next
              </Button>
            ) : (
              <Button
                size="lg"
                disabled={second.length < PIN_MIN}
                onClick={() => {
                  if (second !== first) {
                    setError("The two PINs didn't match. Let's try again.");
                    setFirst("");
                    setSecond("");
                    setStep("enter");
                    return;
                  }
                  onChange(first);
                  reset();
                }}
              >
                Use this PIN
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
