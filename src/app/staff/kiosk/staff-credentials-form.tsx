"use client";

import { useActionState, useEffect } from "react";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { verifyKioskStaffAction } from "@/server/actions/kiosk";

/** Staff email + password, used to unlock the kiosk or to exit kiosk mode. */
export function StaffCredentialsForm({
  intent,
  onUnlocked,
}: {
  intent: "unlock" | "exit";
  onUnlocked?: () => void;
}) {
  const [state, formAction] = useActionState(verifyKioskStaffAction, idleState);

  useEffect(() => {
    if (state.ok) onUnlocked?.();
  }, [state.ok, onUnlocked]);

  return (
    <form action={formAction} className="flex flex-col gap-4 text-left" noValidate>
      <input type="hidden" name="intent" value={intent} />
      <FormMessage state={state} />
      <Field label="Staff email" htmlFor={`kiosk-${intent}-email`} error={state.fieldErrors?.email}>
        <Input
          id={`kiosk-${intent}-email`}
          name="email"
          type="email"
          autoComplete="off"
          autoCapitalize="none"
          required
          className="h-12"
        />
      </Field>
      <Field label="Password" htmlFor={`kiosk-${intent}-password`} error={state.fieldErrors?.password}>
        <Input
          id={`kiosk-${intent}-password`}
          name="password"
          type="password"
          autoComplete="off"
          required
          className="h-12"
        />
      </Field>
      <SubmitButton size="lg" className="w-full" pendingText="Checking…">
        {intent === "unlock" ? "Unlock kiosk" : "Exit kiosk mode"}
      </SubmitButton>
    </form>
  );
}
