"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckboxField, Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { formatCents } from "@/lib/format";
import { parseMoneyToCents } from "@/lib/money";
import { TRANSACTION_TYPE_INFO, qualifyingCents } from "@/lib/transactions";
import { cn } from "@/lib/utils";
import { recordTransactionAction } from "@/server/actions/transactions";
import type { AdjustmentDirection, TransactionType } from "@/types/database";

export type RefundChoice = { purchaseId: string; totalCents: number; remainingCents: number; label: string };

type Props = {
  customerId: string;
  stores: { id: string; name: string }[];
  defaultStoreId: string;
  allowedTypes: TransactionType[];
  refunds: RefundChoice[];
  /** New York dates for the "earlier" option. `monthStart` is null when the user may go back further. */
  dateLimits: { today: string; monthStart: string | null; nowTime: string };
  cancelHref: string;
};

const CHOICE_CARD =
  "flex cursor-pointer flex-col gap-0.5 rounded-lg border border-input bg-white px-4 py-3 transition-colors hover:border-brand-navy/60 has-checked:border-brand-blue has-checked:bg-secondary/60 has-checked:ring-2 has-checked:ring-brand-blue/20";

export function TransactionForm({
  customerId,
  stores,
  defaultStoreId,
  allowedTypes,
  refunds,
  dateLimits,
  cancelHref,
}: Props) {
  const [state, formAction, isPending] = useActionState(recordTransactionAction, idleState);
  const errors = state.fieldErrors ?? {};

  const [type, setType] = useState<TransactionType>("purchase");
  const [amount, setAmount] = useState("");
  const [refundOf, setRefundOf] = useState(refunds[0]?.purchaseId ?? "");
  const [direction, setDirection] = useState<AdjustmentDirection | "">("");
  const [counts, setCounts] = useState(true);
  const [earlier, setEarlier] = useState(false);

  const parsed = parseMoneyToCents(amount);
  const cents = parsed.ok ? parsed.cents : null;
  const chosenRefund = refunds.find((r) => r.purchaseId === refundOf);
  const overRefund = type === "refund" && chosenRefund && cents !== null && cents > chosenRefund.remainingCents;

  const info = TRANSACTION_TYPE_INFO[type];
  const buttonLabel = `Record ${info.label.toLowerCase()}${cents !== null ? ` · ${formatCents(cents)}` : ""}`;

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        // Submit manually so React doesn't clear what was typed when there is an error to fix.
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      <input type="hidden" name="customerId" value={customerId} />
      <FormMessage state={state} />

      {/* What happened */}
      <Card className="p-5 sm:p-6">
        <fieldset>
          <legend className="mb-3 text-base font-bold text-brand-navy-deep">What happened?</legend>
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
            {allowedTypes.map((t) => (
              <label key={t} className={CHOICE_CARD}>
                <input
                  type="radio"
                  name="type"
                  value={t}
                  checked={type === t}
                  onChange={() => setType(t)}
                  className="sr-only"
                />
                <span className="text-[15px] font-semibold">{TRANSACTION_TYPE_INFO[t].label}</span>
                <span className="text-xs text-muted-foreground">{TRANSACTION_TYPE_INFO[t].description}</span>
              </label>
            ))}
          </div>
          {errors.type && <p className="mt-2 text-xs font-medium text-destructive">{errors.type[0]}</p>}
        </fieldset>
      </Card>

      {/* Amount */}
      <Card className="p-5 sm:p-6">
        <Field label="Amount" htmlFor="amount" error={errors.amount}>
          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-2xl font-semibold text-muted-foreground"
            >
              $
            </span>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={Boolean(errors.amount)}
              autoFocus
              className="h-16 pl-10 text-3xl font-bold tracking-tight"
            />
          </div>
        </Field>
        <TierEffect type={type} cents={cents} direction={direction} counts={counts} />
        {type === "refund" && overRefund && chosenRefund && (
          <p role="alert" className="mt-3 flex items-start gap-2 text-sm font-medium text-destructive">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            Only {formatCents(chosenRefund.remainingCents)} is left to refund on that purchase.
          </p>
        )}
      </Card>

      {/* Refund: which purchase */}
      {type === "refund" && (
        <Card className="p-5 sm:p-6">
          <fieldset>
            <legend className="text-base font-bold text-brand-navy-deep">Which purchase is being refunded?</legend>
            <p className="mt-0.5 mb-3 text-sm text-muted-foreground">
              Linking the refund to the original purchase keeps the records clear.
            </p>
            <div className="flex flex-col gap-2.5">
              {refunds.map((r) => (
                <label key={r.purchaseId} className={CHOICE_CARD}>
                  <input
                    type="radio"
                    name="refundOf"
                    value={r.purchaseId}
                    checked={refundOf === r.purchaseId}
                    onChange={() => setRefundOf(r.purchaseId)}
                    className="sr-only"
                  />
                  <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span className="text-[15px] font-semibold">{formatCents(r.totalCents)} purchase</span>
                    <span className="text-sm text-muted-foreground">{r.label}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatCents(r.remainingCents)} left to refund
                    {r.remainingCents < r.totalCents ? " (some already refunded)" : ""}
                  </span>
                </label>
              ))}
              <label className={CHOICE_CARD}>
                <input
                  type="radio"
                  name="refundOf"
                  value=""
                  checked={refundOf === ""}
                  onChange={() => setRefundOf("")}
                  className="sr-only"
                />
                <span className="text-[15px] font-semibold">Not linked to a purchase</span>
                <span className="text-xs text-muted-foreground">
                  {refunds.length === 0
                    ? "This member has no purchases that can still be refunded."
                    : "Use this only if the original purchase isn't listed."}
                </span>
              </label>
            </div>
            {errors.refundOf && <p className="mt-2 text-xs font-medium text-destructive">{errors.refundOf[0]}</p>}
          </fieldset>
        </Card>
      )}

      {/* Adjustment details */}
      {type === "adjustment" && (
        <Card className="p-5 sm:p-6">
          <fieldset>
            <legend className="mb-3 text-base font-bold text-brand-navy-deep">What does this adjustment do?</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={CHOICE_CARD}>
                <input
                  type="radio"
                  name="direction"
                  value="credit"
                  checked={direction === "credit"}
                  onChange={() => setDirection("credit")}
                  className="sr-only"
                />
                <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold">
                  <ArrowUpRight aria-hidden className="size-4 text-success" /> Add to spend
                </span>
                <span className="text-xs text-muted-foreground">A credit. Increases the total.</span>
              </label>
              <label className={CHOICE_CARD}>
                <input
                  type="radio"
                  name="direction"
                  value="debit"
                  checked={direction === "debit"}
                  onChange={() => setDirection("debit")}
                  className="sr-only"
                />
                <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold">
                  <ArrowDownRight aria-hidden className="size-4 text-destructive" /> Subtract from spend
                </span>
                <span className="text-xs text-muted-foreground">A debit. Decreases the total.</span>
              </label>
            </div>
            {errors.direction && <p className="mt-2 text-xs font-medium text-destructive">{errors.direction[0]}</p>}
            <div className="mt-3">
              <CheckboxField
                name="countsTowardTier"
                label="Counts toward the member's tier"
                description="Untick to record it for the history only."
                checked={counts}
                onChange={(e) => setCounts(e.target.checked)}
              />
            </div>
          </fieldset>
        </Card>
      )}

      {/* Details */}
      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 text-base font-bold text-brand-navy-deep">Details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store" htmlFor="locationId" error={errors.locationId}>
            <Select id="locationId" name="locationId" defaultValue={defaultStoreId} aria-invalid={Boolean(errors.locationId)}>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col justify-end">
            <CheckboxField
              name="earlier"
              label="This happened earlier"
              description="Set a past date and time."
              checked={earlier}
              onChange={(e) => setEarlier(e.target.checked)}
            />
          </div>
        </div>

        {earlier && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Date"
              htmlFor="date"
              error={errors.date}
              hint={
                dateLimits.monthStart
                  ? "You can go back to the start of this month. Older dates need the Owner."
                  : "The Owner can record any past date."
              }
            >
              <Input
                id="date"
                name="date"
                type="date"
                defaultValue={dateLimits.today}
                min={dateLimits.monthStart ?? undefined}
                max={dateLimits.today}
              />
            </Field>
            <Field label="Time (New York)" htmlFor="time" error={errors.time}>
              <Input id="time" name="time" type="time" defaultValue={dateLimits.nowTime} />
            </Field>
          </div>
        )}

        <div className="mt-4">
          <Field
            label={type === "adjustment" ? "Note (required)" : "Note (optional)"}
            htmlFor="note"
            error={errors.note}
            hint="Only staff can see notes."
          >
            <Textarea id="note" name="note" maxLength={500} rows={3} aria-invalid={Boolean(errors.note)} />
          </Field>
        </div>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Cancel
        </Link>
        <SubmitButton size="lg" pending={isPending} pendingText="Recording…" className="sm:min-w-64">
          {buttonLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

/** One line under the amount: how this changes the member's tier spend. */
function TierEffect({
  type,
  cents,
  direction,
  counts,
}: {
  type: TransactionType;
  cents: number | null;
  direction: AdjustmentDirection | "";
  counts: boolean;
}) {
  const effect = cents === null ? null : qualifyingCents(type, cents, direction || null, counts);
  const base = "mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold";

  if (cents === null) {
    return <p className="mt-3 text-sm text-muted-foreground">{info(type)}</p>;
  }
  if (effect === null || effect === 0) {
    return (
      <p className={cn(base, "bg-muted text-muted-foreground")}>
        <Minus aria-hidden className="size-4" /> Doesn&apos;t count toward tier spend
      </p>
    );
  }
  return effect > 0 ? (
    <p className={cn(base, "bg-success/10 text-success")}>
      <ArrowUpRight aria-hidden className="size-4" /> Adds {formatCents(effect)} to tier spend
    </p>
  ) : (
    <p className={cn(base, "bg-destructive/10 text-destructive")}>
      <ArrowDownRight aria-hidden className="size-4" /> Takes {formatCents(-effect)} off tier spend
    </p>
  );
}

function info(type: TransactionType): string {
  return TRANSACTION_TYPE_INFO[type].description;
}
