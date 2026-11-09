"use client";

import { useActionState, useEffect, useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { deleteStoreAction } from "@/server/actions/stores";
import type { LocationRow } from "@/types/database";

/** Owner only. Deleting needs the store's exact name typed in — a deliberate, hard-to-do-by-accident step. */
export function DeleteStoreDialog({ store }: { store: LocationRow }) {
  return (
    <Dialog
      title={`Delete ${store.name}?`}
      trigger={(open) => (
        <Button variant="dangerOutline" size="sm" onClick={open}>
          <Trash2 aria-hidden /> Delete
        </Button>
      )}
    >
      <DeleteForm store={store} />
    </Dialog>
  );
}

function DeleteForm({ store }: { store: LocationRow }) {
  const [state, formAction] = useActionState(deleteStoreAction, idleState);
  const { close } = useDialog();
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === store.name;

  useEffect(() => {
    if (state.ok) close();
  }, [state.ok, close]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={store.id} />

      <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/8 p-4 text-sm">
        <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div>
          <p className="font-semibold text-destructive">This can&apos;t be undone.</p>
          <p className="mt-1 text-foreground/80">
            A store can only be deleted if it has no customers, visits or staff. If it does, deactivate it instead —
            that hides it but keeps the history.
          </p>
        </div>
      </div>

      <Field
        label={`Type “${store.name}” to confirm`}
        htmlFor={`confirm-${store.id}`}
        error={state.fieldErrors?.confirmName}
      >
        <Input
          id={`confirm-${store.id}`}
          name="confirmName"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          aria-invalid={Boolean(typed) && !matches}
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton variant="destructive" disabled={!matches} pendingText="Deleting…">
          <Trash2 aria-hidden /> Delete store
        </SubmitButton>
      </div>
    </form>
  );
}
