"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthShell } from "@/components/staff/auth-shell";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { forgotPasswordAction } from "@/server/actions/auth";

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState(forgotPasswordAction, idleState);

  return (
    <AuthShell title="Reset your password" description="We'll email you a link to choose a new password.">
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <FormMessage state={state} />
        {!state.ok && (
          <>
            <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
              <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
            </Field>
            <SubmitButton size="lg" className="w-full" pendingText="Sending…">
              Send reset link
            </SubmitButton>
          </>
        )}
      </form>
      <p className="mt-5 text-center text-sm">
        <Link href="/staff/login" className="font-medium text-brand-blue hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
