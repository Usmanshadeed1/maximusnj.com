"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { PinEntry, RevealToggle } from "@/components/ui/pin-entry";
import type { ActionState } from "@/lib/action-result";
import { PIN_MAX, PIN_MIN } from "@/lib/validation/portal";

type Step = "idle" | "enter" | "confirm";

/** Set or change the member's PIN on an on-screen number pad. The PIN is sent once and never shown again. */
export function PinSetup({
  hasPin,
  save: saveAction,
  intro,
  padOnly = false,
}: {
  hasPin: boolean;
  /** Server action that saves the PIN (the member page and the staff page each pass their own). */
  save: (pin: string, confirmPin: string) => Promise<ActionState>;
  intro?: string;
  /** Just the number pad, already open (for the "choose a new PIN" page). */
  padOnly?: boolean;
}) {
  const [step, setStep] = useState<Step>(padOnly ? "enter" : "idle");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setStep(padOnly ? "enter" : "idle");
    setPin("");
    setConfirm("");
    setRevealed(false);
  };

  const save = () => {
    if (confirm !== pin) {
      setResult({ error: "The two PINs didn't match. Let's try again." });
      setPin("");
      setConfirm("");
      setStep("enter");
      return;
    }
    startTransition(async () => {
      const outcome = await saveAction(pin, confirm);
      setResult(outcome);
      if (outcome.ok) reset();
      else {
        setPin("");
        setConfirm("");
        setStep("enter");
      }
    });
  };

  return (
    <div id="pin" className="scroll-mt-24">
      {!padOnly && (
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-brand-blue">
            <KeyRound aria-hidden className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-brand-navy-deep">
              Your PIN
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {intro ?? (
                <>
                  Forgot your card? Use your PIN to check in at the store
                  entrance: tap &ldquo;Check in with my PIN&rdquo; on the kiosk
                  and type it. Every member&apos;s PIN is different.
                </>
              )}
            </p>
            <p
              className={
                hasPin
                  ? "mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-success"
                  : "mt-2 text-sm font-semibold text-amber-800"
              }
            >
              {hasPin ? <ShieldCheck aria-hidden className="size-4" /> : null}
              {hasPin ? "Your PIN is set." : "You haven't set a PIN yet."}
            </p>
          </div>
        </div>
      )}

      <div className={padOnly ? "" : "mt-4"}>
        <FormMessage state={result} />
      </div>

      {step === "idle" && (
        <Button
          variant={hasPin ? "outline" : "default"}
          size="lg"
          className="mt-4 w-full sm:w-auto"
          onClick={() => {
            setResult({});
            setStep("enter");
          }}
        >
          {hasPin ? "Change my PIN" : "Set my PIN"}
        </Button>
      )}

      {step !== "idle" && (
        <div
          className={
            padOnly
              ? "mt-2 rounded-2xl bg-muted/60 p-4 sm:p-6"
              : "mt-5 rounded-2xl bg-muted/60 p-4 sm:p-6"
          }
        >
          <p className="text-center text-lg font-bold text-brand-navy-deep">
            {step === "enter"
              ? "Choose your new PIN"
              : "Type it again to confirm"}
          </p>
          <p className="mt-1 mb-5 text-center text-sm text-muted-foreground">
            {step === "enter"
              ? `Numbers only, ${PIN_MIN} to ${PIN_MAX} of them.`
              : "Make sure it matches."}
          </p>

          {step === "enter" ? (
            <PinEntry
              key="enter"
              value={pin}
              onChange={setPin}
              minLength={PIN_MIN}
              maxLength={PIN_MAX}
              revealed={revealed}
              label="New PIN"
            />
          ) : (
            <PinEntry
              key="confirm"
              value={confirm}
              onChange={setConfirm}
              minLength={PIN_MIN}
              maxLength={PIN_MAX}
              revealed={revealed}
              label="Confirm PIN"
              disabled={pending}
            />
          )}
          <div className="flex justify-center">
            <RevealToggle
              revealed={revealed}
              onToggle={() => setRevealed((r) => !r)}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              size="lg"
              disabled={pending || (padOnly && step === "enter")}
              onClick={() => {
                if (step === "confirm") {
                  setConfirm("");
                  setStep("enter");
                } else reset();
              }}
            >
              {step === "confirm" ? "Back" : "Cancel"}
            </Button>
            {step === "enter" ? (
              <Button
                size="lg"
                disabled={pin.length < PIN_MIN}
                onClick={() => setStep("confirm")}
              >
                Next
              </Button>
            ) : (
              <Button
                size="lg"
                disabled={confirm.length < PIN_MIN || pending}
                onClick={save}
              >
                <CheckCircle2 aria-hidden /> {pending ? "Saving…" : "Save PIN"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
