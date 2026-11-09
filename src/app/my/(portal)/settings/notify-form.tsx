"use client";

import { startTransition, useActionState, useState } from "react";
import { BellRing, MessageSquareText } from "lucide-react";
import { CheckboxField, FormMessage, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { NOTIFY_OPTIONS } from "@/lib/validation/portal";
import { setNotifyPrefsAction } from "@/server/actions/portal";
import type { NotifyPref } from "@/types/database";

/** How the member wants to hear if they win a raffle (§10.5). SMS arrives in the next release. */
export function NotifyForm({ initial }: { initial: NotifyPref[] }) {
  const [state, formAction, pending] = useActionState(setNotifyPrefsAction, idleState);
  const [selected, setSelected] = useState<NotifyPref[]>(initial);

  const toggle = (value: NotifyPref, on: boolean) =>
    setSelected((prev) => (on ? [...new Set([...prev, value])] : prev.filter((v) => v !== value)));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(() => formAction(new FormData(e.currentTarget)));
      }}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-brand-blue">
          <BellRing aria-hidden className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-bold text-brand-navy-deep">Raffle notifications</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">How would you like to hear if you win a raffle? Pick any that suit you.</p>
        </div>
      </div>

      <FormMessage state={state} />

      <div className="grid gap-2.5">
        {NOTIFY_OPTIONS.map((option) => (
          <CheckboxField
            key={option.value}
            name="prefs"
            value={option.value}
            label={option.label}
            description={option.description}
            checked={selected.includes(option.value)}
            onChange={(e) => toggle(option.value, e.target.checked)}
          />
        ))}
        <CheckboxField
          label="Text message"
          description="Coming soon."
          disabled
          checked={false}
          readOnly
          onChange={() => undefined}
        />
      </div>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <MessageSquareText aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        A raffle may only use some of these. If none match, a team member will call you.
      </p>
      <SubmitButton size="lg" className="w-full sm:w-auto" pending={pending} pendingText="Saving…">
        Save my choices
      </SubmitButton>
    </form>
  );
}
