"use client";

import { useActionState, useEffect } from "react";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { voidTransactionAction } from "@/server/actions/transactions";

/** Owner only. Voiding keeps the row and the reason — nothing is ever deleted. */
export function VoidTransactionDialog({
  transactionId,
  customerId,
  summary,
}: {
  transactionId: string;
  customerId: string;
  /** e.g. "Purchase · $100.00" */
  summary: string;
}) {
  return (
    <Dialog
      title="Void this transaction?"
      description={summary}
      trigger={(open) => (
        <Button variant="ghost" size="sm" onClick={open} className="text-destructive hover:bg-destructive/10">
          <Ban aria-hidden /> Void
        </Button>
      )}
    >
      <VoidForm transactionId={transactionId} customerId={customerId} />
    </Dialog>
  );
}

function VoidForm({ transactionId, customerId }: { transactionId: string; customerId: string }) {
  const [state, formAction] = useActionState(voidTransactionAction, idleState);
  const { close } = useDialog();

  useEffect(() => {
    if (state.ok) close();
  }, [state.ok, close]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="transactionId" value={transactionId} />
      <input type="hidden" name="customerId" value={customerId} />
      <p className="text-sm text-muted-foreground">
        It will stay in the history, marked void, and stop counting toward spend. This is saved in the Audit log.
      </p>
      <Field label="Reason" htmlFor={`void-${transactionId}`} error={state.fieldErrors?.reason}>
        <Input
          id={`void-${transactionId}`}
          name="reason"
          maxLength={300}
          placeholder="e.g. Entered twice by mistake"
          autoFocus
          required
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton variant="destructive" pendingText="Voiding…">
          Void transaction
        </SubmitButton>
      </div>
    </form>
  );
}
