"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect } from "react";
import { Ban, Pencil, UserMinus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { type ActionState, idleState } from "@/lib/action-result";
import {
  addRafflesAction,
  cancelRaffleAction,
  createReleaseAction,
  removeEntryAction,
  updateRaffleAction,
  updateReleaseAction,
} from "@/server/actions/raffles";
import { type RaffleFieldValues, RaffleFields } from "./raffle-fields";

type StoreOption = { id: string; name: string };
export type ReleaseFieldValues = { name: string; description: string; imageUrl: string; releaseDate: string };

/** Submits by hand so React doesn't clear what was typed when there is something to fix. */
function manualSubmit(action: (payload: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => action(formData));
  };
}

function ReleaseFields({ initial, errors, autoFocus }: { initial: ReleaseFieldValues; errors: Record<string, string[] | undefined>; autoFocus?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="Release name" htmlFor="name" error={errors.name}>
        <Input id="name" name="name" defaultValue={initial.name} maxLength={100} placeholder="e.g. Pokémon Surging Sparks booster box" required autoFocus={autoFocus} />
      </Field>
      <Field label="Description (optional)" htmlFor="description" error={errors.description} hint="Members see this when they enter.">
        <Textarea id="description" name="description" defaultValue={initial.description} maxLength={2000} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Release date (optional)" htmlFor="releaseDate" error={errors.releaseDate}>
          <Input id="releaseDate" name="releaseDate" type="date" defaultValue={initial.releaseDate} />
        </Field>
        <Field label="Picture web address (optional)" htmlFor="imageUrl" error={errors.imageUrl} hint="A link to an image, starting with https://">
          <Input id="imageUrl" name="imageUrl" type="url" inputMode="url" defaultValue={initial.imageUrl} placeholder="https://…" />
        </Field>
      </div>
    </div>
  );
}

/** New release + its raffles, in one go. They start as drafts. */
export function NewReleaseForm({
  stores,
  canCompany,
  initial,
}: {
  stores: StoreOption[];
  canCompany: boolean;
  initial: RaffleFieldValues;
}) {
  const [state, formAction, pending] = useActionState(createReleaseAction, idleState);
  const errors = state.fieldErrors ?? {};
  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={manualSubmit(formAction)}>
      <FormMessage state={state} />
      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 text-base font-bold text-brand-navy-deep">The release</h2>
        <ReleaseFields initial={{ name: "", description: "", imageUrl: "", releaseDate: "" }} errors={errors} autoFocus />
      </Card>
      <RaffleFields initial={initial} stores={stores} canCompany={canCompany} multiStore errors={errors} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href="/staff/raffles" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Cancel
        </Link>
        <SubmitButton size="lg" pending={pending} pendingText="Creating…">
          Create as draft
        </SubmitButton>
      </div>
    </form>
  );
}

/** Another store (or the whole company) for an existing release. */
export function AddRafflesForm({
  releaseId,
  stores,
  canCompany,
  initial,
}: {
  releaseId: string;
  stores: StoreOption[];
  canCompany: boolean;
  initial: RaffleFieldValues;
}) {
  const [state, formAction, pending] = useActionState(addRafflesAction, idleState);
  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={manualSubmit(formAction)}>
      <input type="hidden" name="releaseId" value={releaseId} />
      <FormMessage state={state} />
      <RaffleFields initial={initial} stores={stores} canCompany={canCompany} multiStore errors={state.fieldErrors ?? {}} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={`/staff/raffles/${releaseId}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Cancel
        </Link>
        <SubmitButton size="lg" pending={pending} pendingText="Adding…">
          Add as draft
        </SubmitButton>
      </div>
    </form>
  );
}

export function EditRaffleForm({
  releaseId,
  raffleId,
  stores,
  canCompany,
  initial,
  lockScope,
  lockOpens,
}: {
  releaseId: string;
  raffleId: string;
  stores: StoreOption[];
  canCompany: boolean;
  initial: RaffleFieldValues;
  lockScope: boolean;
  lockOpens: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateRaffleAction, idleState);
  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={manualSubmit(formAction)}>
      <input type="hidden" name="releaseId" value={releaseId} />
      <input type="hidden" name="raffleId" value={raffleId} />
      <FormMessage state={state} />
      <RaffleFields
        initial={initial}
        stores={stores}
        canCompany={canCompany}
        multiStore={false}
        lockScope={lockScope}
        lockOpens={lockOpens}
        errors={state.fieldErrors ?? {}}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={`/staff/raffles/${releaseId}/${raffleId}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Cancel
        </Link>
        <SubmitButton size="lg" pending={pending} pendingText="Saving…">
          Save changes
        </SubmitButton>
      </div>
    </form>
  );
}

/** Edit the release details (name, description, picture, release date). */
export function EditReleaseDialog({ releaseId, initial }: { releaseId: string; initial: ReleaseFieldValues }) {
  return (
    <Dialog
      title="Edit release"
      trigger={(open) => (
        <Button variant="outline" onClick={open}>
          <Pencil aria-hidden /> Edit release
        </Button>
      )}
    >
      <EditReleaseForm releaseId={releaseId} initial={initial} />
    </Dialog>
  );
}

function EditReleaseForm({ releaseId, initial }: { releaseId: string; initial: ReleaseFieldValues }) {
  const [state, formAction] = useActionState(updateReleaseAction, idleState);
  const { close } = useDialog();
  useEffect(() => {
    if (state.ok) close();
  }, [state.ok, close]);
  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={manualSubmit(formAction)}>
      <input type="hidden" name="releaseId" value={releaseId} />
      <FormMessage state={state} />
      <ReleaseFields initial={initial} errors={state.fieldErrors ?? {}} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton>Save</SubmitButton>
      </div>
    </form>
  );
}

function ReasonForm({
  action,
  hidden,
  intro,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  intro: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const { close } = useDialog();
  useEffect(() => {
    if (state.ok) close();
  }, [state.ok, close]);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <p className="text-sm">{intro}</p>
      <Field label="Reason" htmlFor="reason" error={state.fieldErrors?.reason} hint="Saved in the audit log.">
        <Input id="reason" name="reason" maxLength={300} required autoFocus />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Keep it
        </Button>
        <SubmitButton variant="destructive">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

export function CancelRaffleDialog({ releaseId, raffleId, label }: { releaseId: string; raffleId: string; label: string }) {
  return (
    <Dialog
      title={`Cancel the ${label} raffle?`}
      trigger={(open) => (
        <Button variant="dangerOutline" onClick={open}>
          <Ban aria-hidden /> Cancel raffle
        </Button>
      )}
    >
      <ReasonForm
        action={cancelRaffleAction}
        hidden={{ releaseId, raffleId }}
        intro="Members won't be able to enter any more. Existing entries are kept for the record."
        submitLabel="Cancel raffle"
      />
    </Dialog>
  );
}

export function RemoveEntryDialog({
  releaseId,
  raffleId,
  entryId,
  name,
}: {
  releaseId: string;
  raffleId: string;
  entryId: string;
  name: string;
}) {
  return (
    <Dialog
      title={`Remove ${name}'s entry?`}
      trigger={(open) => (
        <Button variant="dangerOutline" size="sm" onClick={open}>
          <UserMinus aria-hidden /> Remove
        </Button>
      )}
    >
      <ReasonForm
        action={removeEntryAction}
        hidden={{ releaseId, raffleId, entryId }}
        intro="For example if the same person entered twice. They can't re-enter online afterwards, but staff can add them again in store."
        submitLabel="Remove entry"
      />
    </Dialog>
  );
}
