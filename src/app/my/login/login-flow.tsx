"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useState, useTransition } from "react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { type ActionState, idleState } from "@/lib/action-result";
import { requestLoginCodeAction, verifyLoginCodeAction } from "@/server/actions/portal";

const RESEND_SECONDS = 45;

/** Two steps: enter your email, then type the code we emailed. Same wording whether or not the email is a member's. */
export function LoginFlow() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  return sentTo ? (
    <CodeStep email={sentTo} onBack={() => setSentTo(null)} />
  ) : (
    <EmailStep email={email} setEmail={setEmail} onSent={setSentTo} />
  );
}

function EmailStep({
  email,
  setEmail,
  onSent,
}: {
  email: string;
  setEmail: (value: string) => void;
  onSent: (email: string) => void;
}) {
  const [state, formAction, pending] = useActionState(requestLoginCodeAction, idleState);

  useEffect(() => {
    if (state.ok) onSent(email.trim().toLowerCase());
    // Only react to a new result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(() => formAction(new FormData(e.currentTarget)));
      }}
    >
      <FormMessage state={state} />
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 text-base"
          required
          autoFocus
        />
      </Field>
      <SubmitButton size="lg" className="w-full" pending={pending} pendingText="Sending code…">
        Email me a code
      </SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        New here? Enter your email and we&apos;ll help you join.
      </p>
      <Link href="/" className="text-center text-sm font-medium text-brand-blue hover:underline">
        Back to home
      </Link>
    </form>
  );
}

function CodeStep({ email, onBack }: { email: string; onBack: () => void }) {
  const [state, formAction, pending] = useActionState(verifyLoginCodeAction, idleState);
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [resend, setResend] = useState<ActionState>(idleState);
  const [resending, startResend] = useTransition();

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-lg bg-secondary/70 px-4 py-3 text-sm">
        <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-blue" />
        <p>
          If <strong className="break-all">{email}</strong> can be used to sign in, a code is on its way. It can take a
          minute. Check your spam folder too.
        </p>
      </div>

      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(() => formAction(new FormData(e.currentTarget)));
        }}
      >
        <FormMessage state={state} />
        <input type="hidden" name="email" value={email} />
        <Field label="Code from your email" htmlFor="code" error={state.fieldErrors?.code}>
          <Input
            id="code"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9\s]/g, ""))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={12}
            placeholder="123456"
            aria-invalid={Boolean(state.fieldErrors?.code)}
            className="h-14 text-center font-mono text-2xl tracking-[0.35em]"
            required
            autoFocus
          />
        </Field>
        <SubmitButton size="lg" className="w-full" pending={pending} pendingText="Checking…" disabled={code.replace(/\s/g, "").length < 6}>
          Sign in
        </SubmitButton>
      </form>

      <FormMessage state={resend.error ? { error: resend.error } : {}} />
      <form
        className="flex flex-col items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          startResend(async () => {
            const result = await requestLoginCodeAction(idleState, formData);
            setResend(result);
            if (result.ok) setSeconds(RESEND_SECONDS);
          });
        }}
      >
        <input type="hidden" name="email" value={email} />
        <button
          type="submit"
          disabled={seconds > 0 || resending}
          className="text-sm font-medium text-brand-blue hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          {resending ? "Sending…" : seconds > 0 ? `Send a new code in ${seconds}s` : "Send a new code"}
        </button>
      </form>
      <button
        type="button"
        onClick={onBack}
        className="mx-auto inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" /> Use a different email
      </button>
    </div>
  );
}
