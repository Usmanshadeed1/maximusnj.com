"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { Crown, UserMinus } from "lucide-react";
import { TierBadge } from "@/components/tier-badge";
import { Button } from "@/components/ui/button";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import type { TierKey } from "@/lib/tier/engine";
import { clearTierOverrideAction, setTierOverrideAction } from "@/server/actions/tiers";

const TIERS: TierKey[] = ["base", "silver", "gold", "diamond"];
const CHOICE_CARD =
  "flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-input bg-white px-4 py-3 transition-colors hover:border-brand-navy/60 has-checked:border-brand-blue has-checked:bg-secondary/60 has-checked:ring-2 has-checked:ring-brand-blue/20";

type MonthOption = { value: string; label: string };

/** Owner only: set a member's tier by hand, with a reason and an optional end month. */
export function SetTierDialog({
  customerId,
  customerName,
  currentTier,
  labels,
  monthOptions,
  replacing,
}: {
  customerId: string;
  customerName: string;
  currentTier: TierKey;
  labels: Record<TierKey, string>;
  monthOptions: MonthOption[];
  /** True when an override already exists and this will replace it. */
  replacing: boolean;
}) {
  return (
    <Dialog
      title={replacing ? "Change the tier set by hand" : "Set tier by hand"}
      description={`Choose ${customerName}'s tier yourself. The monthly automatic update won't replace it while it's in effect.`}
      trigger={(open) => (
        <Button variant="outline" size="sm" onClick={open}>
          <Crown aria-hidden /> {replacing ? "Change tier" : "Set tier by hand"}
        </Button>
      )}
    >
      <SetTierForm customerId={customerId} currentTier={currentTier} labels={labels} monthOptions={monthOptions} />
    </Dialog>
  );
}

function SetTierForm({
  customerId,
  currentTier,
  labels,
  monthOptions,
}: {
  customerId: string;
  currentTier: TierKey;
  labels: Record<TierKey, string>;
  monthOptions: MonthOption[];
}) {
  const [state, formAction, isPending] = useActionState(setTierOverrideAction, idleState);
  const { close } = useDialog();
  const [tier, setTier] = useState<TierKey>(currentTier);
  const [endMode, setEndMode] = useState<"none" | "month">("none");
  const [endMonth, setEndMonth] = useState(monthOptions[1]?.value ?? monthOptions[0]?.value ?? "");

  useEffect(() => {
    if (state.ok) close();
  }, [state.ok, close]);

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
      <input type="hidden" name="customerId" value={customerId} />

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Tier</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TIERS.map((key) => (
            <label key={key} className={CHOICE_CARD}>
              <input
                type="radio"
                name="tier"
                value={key}
                checked={tier === key}
                onChange={() => setTier(key)}
                className="sr-only"
              />
              <TierBadge tier={key} label={labels[key]} />
            </label>
          ))}
        </div>
        {state.fieldErrors?.tier && <p className="mt-1.5 text-xs font-medium text-destructive">{state.fieldErrors.tier[0]}</p>}
      </fieldset>

      <Field
        label="Reason"
        htmlFor="override-reason"
        error={state.fieldErrors?.reason}
        hint="Saved in the Audit log, e.g. “Long-time customer”."
      >
        <Input id="override-reason" name="reason" maxLength={300} autoComplete="off" autoFocus required />
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">How long?</legend>
        <div className="flex flex-col gap-2">
          <label className={CHOICE_CARD}>
            <span className="text-sm font-medium">Until I remove it</span>
            <input
              type="radio"
              name="endMode"
              value="none"
              checked={endMode === "none"}
              onChange={() => setEndMode("none")}
              className="sr-only"
            />
          </label>
          <label className={CHOICE_CARD}>
            <span className="text-sm font-medium">Until the end of a month</span>
            <input
              type="radio"
              name="endMode"
              value="month"
              checked={endMode === "month"}
              onChange={() => setEndMode("month")}
              className="sr-only"
            />
          </label>
        </div>
        {endMode === "month" && (
          <div className="mt-3">
            <Field label="Last month it applies" htmlFor="override-end" error={state.fieldErrors?.endMonth}>
              <Select id="override-end" name="endMonth" value={endMonth} onChange={(e) => setEndMonth(e.target.value)}>
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </fieldset>

      <div className="mt-1 flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton pending={isPending} pendingText="Saving…">
          Set tier
        </SubmitButton>
      </div>
    </form>
  );
}

/** Owner only: remove the override so the automatic tier applies again. */
export function ClearTierDialog({ customerId, customerName }: { customerId: string; customerName: string }) {
  return (
    <Dialog
      title="Remove the tier override?"
      description={`${customerName} goes back to the tier the monthly update gives them.`}
      trigger={(open) => (
        <Button variant="dangerOutline" size="sm" onClick={open}>
          <UserMinus aria-hidden /> Remove override
        </Button>
      )}
    >
      <ClearTierForm customerId={customerId} />
    </Dialog>
  );
}

function ClearTierForm({ customerId }: { customerId: string }) {
  const [state, formAction, isPending] = useActionState(clearTierOverrideAction, idleState);
  const { close } = useDialog();

  useEffect(() => {
    if (state.ok) close();
  }, [state.ok, close]);

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
      <input type="hidden" name="customerId" value={customerId} />
      <Field label="Reason" htmlFor="clear-reason" error={state.fieldErrors?.reason} hint="Saved in the Audit log.">
        <Input id="clear-reason" name="reason" maxLength={300} autoComplete="off" autoFocus required />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton variant="destructive" pending={isPending} pendingText="Removing…">
          Remove override
        </SubmitButton>
      </div>
    </form>
  );
}
