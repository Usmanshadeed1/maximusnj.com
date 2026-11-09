"use client";

import { useActionState, useEffect } from "react";
import { KeyRound, Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { linkLoginAction, resetPinAction, unlinkLoginAction } from "@/server/actions/portal-staff";

/** Owner/Manager: the member forgot their PIN. This removes it; they choose a new one in the member page. */
export function ResetPinDialog({ customerId, name }: { customerId: string; name: string }) {
  return (
    <Dialog
      title={`Reset ${name}'s PIN?`}
      trigger={(open) => (
        <Button variant="outline" onClick={open}>
          <KeyRound aria-hidden /> Reset PIN
        </Button>
      )}
    >
      <ReasonForm
        action={resetPinAction}
        customerId={customerId}
        intro="Their PIN is removed. Until they set a new one in the member page, they can check in with just their card."
        reasonRequired={false}
        submitLabel="Reset PIN"
        destructive
      />
    </Dialog>
  );
}

/** Owner/Manager: remove the online login (for example after a lost or changed email). */
export function UnlinkLoginDialog({ customerId, name }: { customerId: string; name: string }) {
  return (
    <Dialog
      title={`Remove ${name}'s online login?`}
      trigger={(open) => (
        <Button variant="dangerOutline" onClick={open}>
          <Link2Off aria-hidden /> Remove online login
        </Button>
      )}
    >
      <ReasonForm
        action={unlinkLoginAction}
        customerId={customerId}
        intro="They won't be able to open the member page with this login. They can sign in again with their email and it links again automatically if the email is theirs alone."
        reasonRequired
        submitLabel="Remove login"
        destructive
      />
    </Dialog>
  );
}

/** Owner/Manager: connect the member to the login that uses their email (shared emails need this). */
export function LinkLoginButton({ customerId }: { customerId: string }) {
  const [state, formAction] = useActionState(linkLoginAction, idleState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <FormMessage state={state} />
      <input type="hidden" name="customerId" value={customerId} />
      <SubmitButton variant="outline" pendingText="Linking…">
        <Link2 aria-hidden /> Link online login
      </SubmitButton>
    </form>
  );
}

function ReasonForm({
  action,
  customerId,
  intro,
  reasonRequired,
  submitLabel,
  destructive,
}: {
  action: typeof resetPinAction;
  customerId: string;
  intro: string;
  reasonRequired: boolean;
  submitLabel: string;
  destructive?: boolean;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const { close } = useDialog();
  useEffect(() => {
    if (state.ok) close();
  }, [state.ok, close]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="customerId" value={customerId} />
      <p className="text-sm">{intro}</p>
      <Field
        label={reasonRequired ? "Reason" : "Reason (optional)"}
        htmlFor="reason"
        error={state.fieldErrors?.reason}
        hint="Saved in the audit log."
      >
        <Input id="reason" name="reason" maxLength={300} required={reasonRequired} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton variant={destructive ? "destructive" : "default"}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
