"use client";

import { useActionState, useEffect } from "react";
import { Download, Eraser } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { anonymizeCustomerAction } from "@/server/actions/privacy";

/** Owner only: download a member's data, or remove their personal details when they ask. */
export function PrivacyActions({ customerId, name, memberNumber }: { customerId: string; name: string; memberNumber: string }) {
  return (
    <>
      <a href={`/staff/customers/${customerId}/export`} className={buttonVariants({ variant: "outline" })}>
        <Download aria-hidden /> Download their data
      </a>
      <Dialog
        title={`Erase ${name}'s personal details?`}
        trigger={(open) => (
          <Button variant="dangerOutline" onClick={open}>
            <Eraser aria-hidden /> Erase personal details…
          </Button>
        )}
      >
        <EraseForm customerId={customerId} memberNumber={memberNumber} />
      </Dialog>
    </>
  );
}

function EraseForm({ customerId, memberNumber }: { customerId: string; memberNumber: string }) {
  const [state, formAction] = useActionState(anonymizeCustomerAction, idleState);
  const { close } = useDialog();
  useEffect(() => {
    if (state.ok) close();
  }, [state.ok, close]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="memberNumber" value={memberNumber} />
      <p className="text-sm">
        Their name, phone, email, PIN and online login are removed for good, and they become inactive. Their visits and sales stay under the
        member number so your books still add up. <strong>This cannot be undone.</strong>
      </p>
      <Field label="Reason" htmlFor="reason" error={state.fieldErrors?.reason} hint="Saved in the audit log (without their details).">
        <Input id="reason" name="reason" maxLength={300} placeholder="e.g. Member asked us to delete their data" required />
      </Field>
      <Field label={`Type ${memberNumber} to confirm`} htmlFor="confirm" error={state.fieldErrors?.confirm}>
        <Input id="confirm" name="confirm" className="font-mono uppercase" autoComplete="off" required />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton variant="destructive" pendingText="Erasing…">
          Erase for good
        </SubmitButton>
      </div>
    </form>
  );
}
