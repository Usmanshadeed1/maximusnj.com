"use client";

import { useEffect, useState, useTransition } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { PinCapture } from "@/components/ui/pin-capture";
import { type ActionState, idleState } from "@/lib/action-result";
import { requestLoginCodeAction } from "@/server/actions/portal";
import { type ResetWho, saveNewPinAction, verifyResetCodeAction } from "@/server/actions/forgot-pin";

const RESEND_SECONDS = 45;

type Step = { name: "email" } | { name: "code"; email: string } | { name: "pin"; who: ResetWho };

/** Forgot PIN or card: email → code → new PIN → logged in. The same for members and staff. */
export function ForgotFlow() {
  const [step, setStep] = useState<Step>({ name: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [state, setState] = useState<ActionState>(idleState);
  const [pending, startTransition] = useTransition();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const sendCode = (to: string) =>
    startTransition(async () => {
      const data = new FormData();
      data.set("email", to);
      const result = await requestLoginCodeAction(idleState, data);
      setState(result.ok ? idleState : result);
      if (result.ok) {
        setStep({ name: "code", email: to.trim().toLowerCase() });
        setSeconds(RESEND_SECONDS);
      }
    });

  if (step.name === "email") {
    return (
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          sendCode(email);
        }}
      >
        <p className="text-[15px] text-muted-foreground">Type the email on your account. We&apos;ll send you a code so you can choose a new PIN.</p>
        <FormMessage state={state} />
        <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 text-base"
            autoFocus
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={pending || !email.trim()}>
          {pending ? "Sending code…" : "Email me a code"}
        </Button>
      </form>
    );
  }

  if (step.name === "code") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-lg bg-secondary/70 px-4 py-3 text-sm">
          <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-blue" />
          <p>
            If <strong className="break-all">{step.email}</strong> is on an account, a code is on its way. Check your spam folder too.
          </p>
        </div>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await verifyResetCodeAction(step.email, code);
              setState(result.ok ? idleState : result);
              if (result.ok && result.who) setStep({ name: "pin", who: result.who });
            });
          }}
        >
          <FormMessage state={state} />
          <Field label="Code from your email" htmlFor="code" error={state.fieldErrors?.code}>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              placeholder="123456"
              className="h-14 text-center font-mono text-2xl tracking-[0.35em]"
              autoFocus
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={pending || code.length < 6}>
            {pending ? "Checking…" : "Next"}
          </Button>
        </form>
        <button
          type="button"
          disabled={seconds > 0 || pending}
          onClick={() => sendCode(step.email)}
          className="text-sm font-medium text-brand-blue hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          {seconds > 0 ? `Send a new code in ${seconds}s` : "Send a new code"}
        </button>
        <button
          type="button"
          onClick={() => {
            setState(idleState);
            setCode("");
            setStep({ name: "email" });
          }}
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-muted-foreground">Choose your new PIN: 6 to 12 numbers, typed twice. Keep it secret.</p>
      <FormMessage state={state} />
      <PinCapture value={pin} onChange={setPin} startLabel="Choose my new PIN" />
      <Button
        size="lg"
        className="w-full"
        disabled={!pin || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await saveNewPinAction(step.who, pin);
            // Only comes back when it didn't work (success goes to the next page).
            if (result?.error) {
              setState(result);
              setPin("");
            }
          })
        }
      >
        {pending ? "Saving…" : "Save PIN and log in"}
      </Button>
    </div>
  );
}
