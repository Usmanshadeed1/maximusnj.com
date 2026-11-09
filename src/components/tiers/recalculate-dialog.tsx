"use client";

import { startTransition, useActionState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { recalculateAction } from "@/server/actions/tier-awards";

type MonthOption = { value: string; label: string };

/**
 * Owner only: decide a finished month again, for one member or for everyone.
 * The old results are kept — a new result is added next to them — and the reason is saved.
 */
export function RecalculateDialog({
  monthOptions,
  customerId,
  title,
  description,
  buttonLabel = "Recalculate",
  variant = "outline",
}: {
  monthOptions: MonthOption[];
  /** Leave empty to recalculate everyone. */
  customerId?: string;
  title: string;
  description: string;
  buttonLabel?: string;
  variant?: "outline" | "secondary";
}) {
  return (
    <Dialog
      title={title}
      description={description}
      trigger={(open) => (
        <Button variant={variant} size="sm" onClick={open}>
          <RefreshCw aria-hidden /> {buttonLabel}
        </Button>
      )}
    >
      <RecalculateForm monthOptions={monthOptions} customerId={customerId} />
    </Dialog>
  );
}

function RecalculateForm({ monthOptions, customerId }: { monthOptions: MonthOption[]; customerId?: string }) {
  const [state, formAction, isPending] = useActionState(recalculateAction, idleState);
  const { close } = useDialog();

  if (state.ok) {
    return (
      <div className="flex flex-col gap-4">
        <div role="status" className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/8 p-4 text-[15px]">
          <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
          <p>{state.message}</p>
        </div>
        <div className="flex justify-end">
          <Button onClick={close}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      <FormMessage state={state} />
      {customerId && <input type="hidden" name="customerId" value={customerId} />}

      <Field label="Which month?" htmlFor="recalc-month" error={state.fieldErrors?.month} hint="The month whose tier you want to decide again.">
        <Select id="recalc-month" name="month" defaultValue={monthOptions[0]?.value}>
          {monthOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Why are you doing this?"
        htmlFor="recalc-reason"
        error={state.fieldErrors?.reason}
        hint="For example: “A refund was entered after the month ended.” This is saved in the Audit log."
      >
        <Input id="recalc-reason" name="reason" maxLength={300} autoComplete="off" autoFocus required />
      </Field>

      <p className="rounded-lg bg-secondary/60 px-4 py-3 text-sm">
        The month is decided again from the sales and visits as they are <strong>today</strong>. If the answer is the
        same, nothing changes. If it is different, the new result is added and the old one stays in the history.
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton pending={isPending} pendingText="Recalculating…">
          Recalculate
        </SubmitButton>
      </div>
    </form>
  );
}
