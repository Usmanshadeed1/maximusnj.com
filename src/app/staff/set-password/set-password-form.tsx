"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { setPasswordAction } from "@/server/actions/auth";

export function SetPasswordForm() {
  const [state, formAction] = useActionState(setPasswordAction, idleState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field label="New password" htmlFor="password" error={state.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required autoFocus />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" error={state.fieldErrors?.confirmPassword}>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton size="lg" className="mt-1 w-full">
        Save password
      </SubmitButton>
    </form>
  );
}
