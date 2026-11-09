"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { Package, UserPlus } from "lucide-react";
import { type PickerProduct, ChoicePicker } from "@/components/raffles/choice-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { setRaffleProductsAction } from "@/server/actions/products";
import { assignProductAction, enterMemberAction } from "@/server/actions/raffles";

/** On the "new raffle" forms: which products the raffle offers, in the order members see them. */
export function RaffleProductsField({ products }: { products: PickerProduct[] }) {
  const [order, setOrder] = useState<string[]>([]);
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-base font-bold text-brand-navy-deep">Products in this raffle</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Members rank the products they want. Leave empty for a single-item raffle. Add products in the Products page.
      </p>
      {products.length === 0 ? (
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">No products yet. Add them under Products in the menu.</p>
      ) : (
        <ChoicePicker
          products={products}
          value={order}
          onChange={setOrder}
          name="productIds"
          orderedLabel="Offered, in this order"
          availableLabel="Tap to add"
          emptyText="No products picked: this raffle is for a single item."
        />
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
  const [order, setOrder] = useState(current);
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
      <ChoicePicker products={all} value={order} onChange={setOrder} name="productIds" orderedLabel="Offered, in this order" emptyText="No products: a single-item raffle." />
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
