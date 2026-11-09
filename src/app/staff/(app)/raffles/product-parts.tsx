"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { Package, UserPlus } from "lucide-react";
import { type PickerProduct, ChoicePicker } from "@/components/raffles/choice-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { CheckboxField, FormMessage, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { setRaffleProductsAction } from "@/server/actions/products";
import { assignProductAction, enterMemberAction } from "@/server/actions/raffles";

/** Tick the products a raffle offers. No order here: members put them in their own order when they enter. */
function ProductCheckboxes({ products, selected, onChange }: { products: PickerProduct[]; selected: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {products.map((p) => (
        <CheckboxField
          key={p.id}
          name="productIds"
          value={p.id}
          label={p.name}
          description={p.description ?? undefined}
          checked={selected.includes(p.id)}
          onChange={(e) => onChange(e.target.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id))}
        />
      ))}
    </div>
  );
}

/** On the "new raffle" forms: which products the raffle offers. */
export function RaffleProductsField({ products }: { products: PickerProduct[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-base font-bold text-brand-navy-deep">Products in this raffle</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Tick the products in this raffle. Members put them in their own order of preference when they enter. Leave all unticked for a single-item raffle.
      </p>
      {products.length === 0 ? (
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">No products yet. Add them under Products in the menu.</p>
      ) : (
        <ProductCheckboxes products={products} selected={selected} onChange={setSelected} />
      )}
    </Card>
  );
}

/** On a raffle's page: change the products it offers (only adding, once people have entered). */
export function ChangeProductsDialog({
  releaseId,
  raffleId,
  all,
  current,
}: {
  releaseId: string;
  raffleId: string;
  all: PickerProduct[];
  current: string[];
}) {
  return (
    <Dialog
      title="Products in this raffle"
      trigger={(open) => (
        <Button variant="outline" onClick={open}>
          <Package aria-hidden /> Change products
        </Button>
      )}
    >
      <ChangeProductsForm releaseId={releaseId} raffleId={raffleId} all={all} current={current} />
    </Dialog>
  );
}

function ChangeProductsForm({ releaseId, raffleId, all, current }: { releaseId: string; raffleId: string; all: PickerProduct[]; current: string[] }) {
  const [state, formAction] = useActionState(setRaffleProductsAction, idleState);
  const [selected, setSelected] = useState(current);
  const { close } = useDialog();
  useEffect(() => {
    if (state.ok) close();
  }, [state.ok, close]);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <FormMessage state={state} />
      <input type="hidden" name="releaseId" value={releaseId} />
      <input type="hidden" name="raffleId" value={raffleId} />
      <p className="text-sm text-muted-foreground">Tick the products in this raffle. Once people have entered, products can be added but not taken off.</p>
      <ProductCheckboxes products={all} selected={selected} onChange={setSelected} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton>Save products</SubmitButton>
      </div>
    </form>
  );
}

/** In store: enter a member, recording the products they want in order. */
export function EnterWithChoicesDialog({
  releaseId,
  raffleId,
  customerId,
  name,
  products,
}: {
  releaseId: string;
  raffleId: string;
  customerId: string;
  name: string;
  products: PickerProduct[];
}) {
  return (
    <Dialog
      title={`Enter ${name}`}
      description="Ask which products they want, starting with the one they want most."
      trigger={(open) => (
        <Button onClick={open}>
          <UserPlus aria-hidden /> Enter in raffle
        </Button>
      )}
    >
      <EnterForm releaseId={releaseId} raffleId={raffleId} customerId={customerId} products={products} />
    </Dialog>
  );
}

function EnterForm({ releaseId, raffleId, customerId, products }: { releaseId: string; raffleId: string; customerId: string; products: PickerProduct[] }) {
  const [order, setOrder] = useState<string[]>([]);
  const { close } = useDialog();
  return (
    <form action={enterMemberAction} className="flex flex-col gap-4">
      <input type="hidden" name="releaseId" value={releaseId} />
      <input type="hidden" name="raffleId" value={raffleId} />
      <input type="hidden" name="customerId" value={customerId} />
      <ChoicePicker products={products} value={order} onChange={setOrder} name="choices" orderedLabel="Their choices, in order" emptyText="Tap the products they want, starting with their favourite." />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton disabled={order.length === 0} pendingText="Entering…">
          Enter in raffle
        </SubmitButton>
      </div>
    </form>
  );
}

/** After the draw: give a person a product by hand (or take it back). */
export function AssignProductForm({
  releaseId,
  raffleId,
  resultId,
  products,
  assignedId,
}: {
  releaseId: string;
  raffleId: string;
  resultId: string;
  products: PickerProduct[];
  assignedId: string | null;
}) {
  const [value, setValue] = useState(assignedId ?? "");
  return (
    <form action={assignProductAction} className="flex items-center gap-2">
      <input type="hidden" name="releaseId" value={releaseId} />
      <input type="hidden" name="raffleId" value={raffleId} />
      <input type="hidden" name="resultId" value={resultId} />
      <label className="sr-only" htmlFor={`assign-${resultId}`}>
        Product given
      </label>
      <select
        id={`assign-${resultId}`}
        name="productId"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-9 max-w-52 rounded-md border border-input bg-white px-2 text-sm"
      >
        <option value="">No product given</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={value === (assignedId ?? "")}>
        Give
      </Button>
    </form>
  );
}
