"use client";

import { useActionState, useEffect } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { createStoreAction, updateStoreAction } from "@/server/actions/stores";
import type { LocationRow } from "@/types/database";

/** "Add store" button (no `store`) or "Edit" button (with `store`), each opening a form dialog. */
export function StoreFormDialog({ store }: { store?: LocationRow }) {
  return (
    <Dialog
      title={store ? `Edit ${store.name}` : "Add a store"}
      description={store ? undefined : "Store codes are short IDs used on reports, e.g. NJ1."}
      trigger={(open) =>
        store ? (
          <Button variant="ghost" size="sm" onClick={open}>
            <Pencil aria-hidden /> Edit
          </Button>
        ) : (
          <Button onClick={open}>
            <Plus aria-hidden /> Add store
          </Button>
        )
      }
    >
      <StoreForm store={store} />
    </Dialog>
  );
}

function StoreForm({ store }: { store?: LocationRow }) {
  const { close } = useDialog();
  const [state, formAction] = useActionState(store ? updateStoreAction : createStoreAction, idleState);

  useEffect(() => {
    if (state.ok) close();
  }, [state.ok, close]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      {store && <input type="hidden" name="id" value={store.id} />}
      <Field label="Store name" htmlFor="name" error={state.fieldErrors?.name}>
        <Input id="name" name="name" defaultValue={store?.name} required autoFocus />
      </Field>
      <Field label="Store code" htmlFor="code" error={state.fieldErrors?.code} hint="2–10 letters or numbers.">
        <Input
          id="code"
          name="code"
          defaultValue={store?.code}
          required
          maxLength={10}
          className="font-mono uppercase"
        />
      </Field>
      <Field label="Address (optional)" htmlFor="address" error={state.fieldErrors?.address}>
        <Input id="address" name="address" defaultValue={store?.address ?? ""} />
      </Field>
      {store && (
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={store.is_active}
            className="size-5 accent-brand-blue"
          />
          Store is active
        </label>
      )}
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton>{store ? "Save changes" : "Add store"}</SubmitButton>
      </div>
    </form>
  );
}
