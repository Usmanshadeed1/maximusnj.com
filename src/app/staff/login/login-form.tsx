"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { signInAction } from "@/server/actions/auth";

export function LoginForm() {
  const [state, formAction] = useActionState(signInAction, idleState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton size="lg" className="mt-1 w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
