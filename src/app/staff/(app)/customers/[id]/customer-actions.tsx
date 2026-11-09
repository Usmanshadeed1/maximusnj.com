"use client";

import { useActionState, useEffect } from "react";
import { GitMerge, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { type MergeState, mergeCustomerAction, setCustomerStatusAction } from "@/server/actions/customers";
import type { CustomerStatus } from "@/types/database";

/** Owner/Manager: mark a member active or inactive, with an optional reason for the audit log. */
export function StatusDialog({ customerId, name, status }: { customerId: string; name: string; status: CustomerStatus }) {
  const deactivate = status === "active";
  return (
    <Dialog
      title={deactivate ? `Deactivate ${name}?` : `Reactivate ${name}?`}
      trigger={(open) => (
        <Button variant={deactivate ? "dangerOutline" : "outline"} onClick={open}>
          <Power aria-hidden /> {deactivate ? "Deactivate member" : "Reactivate member"}
        </Button>
      )}
    >
      <StatusForm customerId={customerId} deactivate={deactivate} />
    </Dialog>
  );
}

function StatusForm({ customerId, deactivate }: { customerId: string; deactivate: boolean }) {
  const [state, formAction] = useActionState(setCustomerStatusAction, idleState);
  const { close } = useDialog();
  useEffect(() => {
    if (state.ok) close();
  }, [state.ok, close]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="status" value={deactivate ? "inactive" : "active"} />
      <p className="text-sm">
        {deactivate
          ? "They won't be able to check in or enter raffles until reactivated. Their history is kept."
          : "They'll be able to check in and enter raffles again."}
      </p>
      <Field label="Reason (optional)" htmlFor="reason" hint="Saved in the audit log.">
        <Input id="reason" name="reason" maxLength={300} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton variant={deactivate ? "destructive" : "default"}>
          {deactivate ? "Deactivate" : "Reactivate"}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Owner only: merge this (duplicate) record into the member to keep. Two steps: look up, then confirm. */
export function MergeCustomerDialog({
  customerId,
  name,
  memberNumber,
}: {
  customerId: string;
  name: string;
  memberNumber: string;
}) {
  return (
    <Dialog
      title="Merge duplicate"
      description={`${name} (${memberNumber}) will be merged into the member you keep.`}
      trigger={(open) => (
        <Button variant="outline" onClick={open}>
          <GitMerge aria-hidden /> Merge duplicate…
        </Button>
      )}
    >
      <MergeForm customerId={customerId} memberNumber={memberNumber} />
    </Dialog>
  );
}

function MergeForm({ customerId, memberNumber }: { customerId: string; memberNumber: string }) {
  const [state, formAction] = useActionState<MergeState, FormData>(mergeCustomerAction, {});
  const { close } = useDialog();
  const confirm = state.confirm;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="sourceId" value={customerId} />

      {confirm ? (
        <>
          <input type="hidden" name="targetMemberNumber" value={confirm.memberNumber} />
          <input type="hidden" name="reason" value={confirm.reason} />
          <input type="hidden" name="confirmTargetId" value={confirm.targetId} />
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Please confirm</p>
            <p className="mt-1">
              <span className="font-mono font-semibold">{memberNumber}</span> will become inactive and point to{" "}
              <span className="font-semibold">
                {confirm.name} ({confirm.memberNumber})
              </span>
              . This can&apos;t be undone from the app.
            </p>
            <p className="mt-2 text-amber-900/80">Reason: {confirm.reason}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <SubmitButton variant="destructive" pendingText="Merging…">
              Merge into {confirm.memberNumber}
            </SubmitButton>
          </div>
        </>
      ) : (
        <>
          <Field
            label="Member number to keep"
            htmlFor="targetMemberNumber"
            error={state.fieldErrors?.targetMemberNumber}
            hint="The record that stays active, e.g. MAX000012."
          >
            <Input id="targetMemberNumber" name="targetMemberNumber" className="font-mono uppercase" autoFocus required />
          </Field>
          <Field label="Reason" htmlFor="reason" error={state.fieldErrors?.reason}>
            <Input id="reason" name="reason" placeholder="e.g. Registered twice by mistake" required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <SubmitButton pendingText="Checking…">Continue</SubmitButton>
          </div>
        </>
      )}
    </form>
  );
}
