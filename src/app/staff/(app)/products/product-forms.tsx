"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { CheckboxField, Field, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { createProductAction, updateProductAction } from "@/server/actions/products";
import type { ProductRow } from "@/types/database";

function Fields({ initial, errors }: { initial?: ProductRow; errors: Record<string, string[] | undefined> }) {
  return (
    <>
      <Field label="Name" htmlFor="name" error={errors.name}>
        <Input id="name" name="name" defaultValue={initial?.name} maxLength={120} placeholder="e.g. Surging Sparks Booster Box" required autoFocus />
      </Field>
      <Field label="Description (optional)" htmlFor="description" error={errors.description}>
        <Textarea id="description" name="description" defaultValue={initial?.description ?? ""} maxLength={1000} />
      </Field>
      <Field label="Picture web address (optional)" htmlFor="imageUrl" error={errors.imageUrl} hint="A link to an image, starting with https://">
        <Input id="imageUrl" name="imageUrl" type="url" inputMode="url" defaultValue={initial?.image_url ?? ""} placeholder="https://…" />
      </Field>
    </>
  );
}

/** Add a product. The form empties itself after each one, so several can be added in a row. */
export function AddProductDialog() {
  return (
    <Dialog
      title="Add a product"
      trigger={(open) => (
        <Button size="lg" onClick={open}>
          <Plus aria-hidden /> Add product
        </Button>
      )}
    >
      <AddForm />
    </Dialog>
  );
}

function AddForm() {
  const [state, formAction] = useActionState(createProductAction, idleState);
  const { close } = useDialog();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) close();
  }, [state.ok, close]);

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <FormMessage state={state} />
      <Fields errors={state.fieldErrors ?? {}} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton>Add product</SubmitButton>
      </div>
    </form>
  );
}

export function EditProductDialog({ product }: { product: ProductRow }) {
  return (
    <Dialog
      title={`Edit ${product.name}`}
      trigger={(open) => (
        <Button variant="outline" size="sm" onClick={open}>
          <Pencil aria-hidden /> Edit
        </Button>
      )}
    >
      <EditForm product={product} />
    </Dialog>
  );
}

function EditForm({ product }: { product: ProductRow }) {
  const [state, formAction] = useActionState(updateProductAction, idleState);
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
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <input type="hidden" name="productId" value={product.id} />
      <FormMessage state={state} />
      <Fields initial={product} errors={state.fieldErrors ?? {}} />
      <CheckboxField
        name="isActive"
        defaultChecked={product.is_active}
        label="Available for new raffles"
        description="Untick to hide it from new raffles. Raffles that already offer it keep it."
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton>Save</SubmitButton>
      </div>
    </form>
  );
}
