"use client";

import { useEffect, useState, useTransition } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { type ActionState, idleState } from "@/lib/action-result";
import { requestResetLinkAction } from "@/server/actions/forgot-pin";

const RESEND_SECONDS = 45;

/** Forgot PIN or card: type your email, then tap the link we send. The same for members and staff. */
export function ForgotFlow() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [state, setState] = useState<ActionState>(idleState);
  const [pending, startTransition] = useTransition();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const send = (to: string) =>
    startTransition(async () => {
      const result = await requestResetLinkAction(to);
      setState(result.ok ? idleState : result);
      if (result.ok) {
        setSentTo(to.trim().toLowerCase());
        setSeconds(RESEND_SECONDS);
      }
    });

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <MailCheck aria-hidden className="mx-auto size-12 text-brand-blue" />
        <h2 className="text-xl font-bold text-brand-navy-deep">Check your email</h2>
        <p className="text-[15px] text-muted-foreground">
          If <strong className="break-all text-foreground">{sentTo}</strong> is on an account, we sent a link. Tap{" "}
          <strong className="text-foreground">Sign in</strong> in that email to choose a new PIN. Check your spam folder too.
        </p>
        <FormMessage state={state} />
        <button
          type="button"
          disabled={seconds > 0 || pending}
          onClick={() => send(sentTo)}
          className="text-sm font-medium text-brand-blue hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          {pending ? "Sending…" : seconds > 0 ? `Send again in ${seconds}s` : "Send again"}
        </button>
        <button
          type="button"
          onClick={() => {
            setState(idleState);
            setSentTo(null);
          }}
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        send(email);
      }}
    >
      <p className="text-[15px] text-muted-foreground">Type the email on your account. We&apos;ll send you a link to choose a new PIN.</p>
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
        {pending ? "Sending…" : "Email me a link"}
      </Button>
    </form>
  );
}
