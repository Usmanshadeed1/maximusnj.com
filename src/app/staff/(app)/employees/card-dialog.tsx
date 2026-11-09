"use client";

import { startTransition, useActionState, useEffect } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui/form";
import { type ActionState, idleState } from "@/lib/action-result";
import { createEmployeeCardAction, linkEmployeeCardAction, unlinkEmployeeCardAction } from "@/server/actions/staff-pin";

/** Owner: give an employee a member card (so they can use their card and PIN at the kiosk). */
export function EmployeeCardDialog({
  employeeId,
  name,
  memberNumber,
  stores,
}: {
  employeeId: string;
  name: string;
  memberNumber: string | null;
  stores: { id: string; name: string }[];
}) {
  return (
    <Dialog
      title={`${name}'s member card`}
      description="Used at the kiosk with their PIN: check in, or open the staff dashboard."
      trigger={(open) => (
        <Button variant="outline" size="sm" onClick={open}>
          <CreditCard aria-hidden /> {memberNumber ?? "Card"}
        </Button>
      )}
    >
      {memberNumber ? <Linked employeeId={employeeId} memberNumber={memberNumber} /> : <NotLinked employeeId={employeeId} stores={stores} />}
    </Dialog>
  );
}

function useCloseOnSuccess(state: ActionState) {
  const { close } = useDialog();
  useEffect(() => {
    if (state.ok) close();
  }, [state.ok, close]);
  return close;
}

function Linked({ employeeId, memberNumber }: { employeeId: string; memberNumber: string }) {
  const [state, formAction] = useActionState(unlinkEmployeeCardAction, idleState);
  const close = useCloseOnSuccess(state);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <p className="text-sm">
        Card <span className="font-mono font-semibold">{memberNumber}</span> belongs to this employee. Removing it stops their card and PIN
        opening the staff dashboard. The member record itself stays.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Close
        </Button>
        <SubmitButton variant="destructive">Remove card</SubmitButton>
      </div>
    </form>
  );
}

function NotLinked({ employeeId, stores }: { employeeId: string; stores: { id: string; name: string }[] }) {
  const [linkState, linkAction] = useActionState(linkEmployeeCardAction, idleState);
  const [createState, createAction] = useActionState(createEmployeeCardAction, idleState);
  const close = useCloseOnSuccess(linkState.ok ? linkState : createState);

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => createAction(data));
        }}
      >
        <p className="text-sm font-semibold">Create a new card</p>
        <FormMessage state={createState} />
        <input type="hidden" name="employeeId" value={employeeId} />
        <Field label="Home store" htmlFor={`card-store-${employeeId}`} error={createState.fieldErrors?.locationId}>
          <Select id={`card-store-${employeeId}`} name="locationId" defaultValue={stores[0]?.id ?? ""}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton pendingText="Creating…">Create card</SubmitButton>
      </form>

      <div className="flex items-center gap-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase" aria-hidden>
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => linkAction(data));
        }}
      >
        <p className="text-sm font-semibold">They already have a member card</p>
        <FormMessage state={linkState} />
        <input type="hidden" name="employeeId" value={employeeId} />
        <Field label="Member number" htmlFor={`card-number-${employeeId}`} error={linkState.fieldErrors?.memberNumber}>
          <Input id={`card-number-${employeeId}`} name="memberNumber" className="font-mono uppercase" placeholder="MAX000123" autoComplete="off" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <SubmitButton variant="outline" pendingText="Linking…">
            Link this card
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
