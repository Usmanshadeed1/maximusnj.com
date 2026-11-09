"use client";

import { useActionState, useEffect } from "react";
import { Dices, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { claimWinAction, drawRaffleAction } from "@/server/actions/raffle-results";

/** The draw can't be undone, so it asks first. */
export function DrawDialog({ releaseId, raffleId, winners }: { releaseId: string; raffleId: string; winners: number }) {
  return (
    <Dialog
      title="Run the draw?"
      trigger={(open) => (
        <Button size="lg" variant="accent" onClick={open}>
          <Dices aria-hidden /> Draw winners
        </Button>
      )}
    >
      <form action={drawRaffleAction} className="flex flex-col gap-4">
        <input type="hidden" name="releaseId" value={releaseId} />
        <input type="hidden" name="raffleId" value={raffleId} />
        <p className="text-sm">
          Everyone who entered is put in a random order. The first <strong>{winners}</strong> {winners === 1 ? "is the winner" : "are the winners"}, and the rest are kept in order in case someone can&apos;t collect.
        </p>
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          This can only be done once. It can&apos;t be undone or run again.
        </p>
        <DrawButtons />
      </form>
    </Dialog>
  );
}

function DrawButtons() {
  const { close } = useDialog();
  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={close}>
        Not yet
      </Button>
      <SubmitButton pendingText="Drawing…">Yes, draw now</SubmitButton>
    </div>
  );
}

/** The winner paid and collected: records the purchase and marks the win as claimed. */
export function ClaimDialog({
  releaseId,
  raffleId,
  resultId,
  name,
  stores,
  defaultStoreId,
}: {
  releaseId: string;
  raffleId: string;
  resultId: string;
  name: string;
  stores: { id: string; name: string }[];
  defaultStoreId: string;
}) {
  return (
    <Dialog
      title={`${name} collected?`}
      description="Record what they paid. It is saved as a normal purchase and counts toward their tier."
      trigger={(open) => (
        <Button size="sm" onClick={open}>
          <ShoppingBag aria-hidden /> Collected
        </Button>
      )}
    >
      <ClaimForm releaseId={releaseId} raffleId={raffleId} resultId={resultId} stores={stores} defaultStoreId={defaultStoreId} />
    </Dialog>
  );
}

function ClaimForm({
  releaseId,
  raffleId,
  resultId,
  stores,
  defaultStoreId,
}: {
  releaseId: string;
  raffleId: string;
  resultId: string;
  stores: { id: string; name: string }[];
  defaultStoreId: string;
}) {
  const [state, formAction] = useActionState(claimWinAction, idleState);
  const { close } = useDialog();
  useEffect(() => {
    if (state.ok) close();
  }, [state.ok, close]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="releaseId" value={releaseId} />
      <input type="hidden" name="raffleId" value={raffleId} />
      <input type="hidden" name="resultId" value={resultId} />
      <Field label="Amount paid" htmlFor={`amount-${resultId}`} error={state.fieldErrors?.amount}>
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-muted-foreground">
            $
          </span>
          <Input id={`amount-${resultId}`} name="amount" inputMode="decimal" placeholder="0.00" className="pl-8" autoFocus required />
        </div>
      </Field>
      <Field label="Store" htmlFor={`store-${resultId}`} error={state.fieldErrors?.locationId}>
        <Select id={`store-${resultId}`} name="locationId" defaultValue={defaultStoreId}>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton pendingText="Saving…">Record purchase</SubmitButton>
      </div>
    </form>
  );
}

/** A submit button that asks "are you sure?" first (for changes that can't be undone). */
export function ConfirmSubmitButton({
  message,
  children,
  variant = "outline",
}: {
  message: string;
  children: React.ReactNode;
  variant?: "outline" | "dangerOutline";
}) {
  return (
    <Button
      type="submit"
      size="sm"
      variant={variant}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
