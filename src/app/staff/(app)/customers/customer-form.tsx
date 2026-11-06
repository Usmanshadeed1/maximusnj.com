"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckboxField, Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui/form";
import { formatPhone } from "@/lib/phone";
import {
  type CustomerFormState,
  registerCustomerAction,
  updateCustomerAction,
} from "@/server/actions/customers";
import type { DuplicateMatch } from "@/types/database";

export type CustomerFormValues = {
  firstName: string;
  lastName: string;
  mobile: string;
  noMobile: boolean;
  email: string;
  inStoreOnly: boolean;
  homeLocationId: string;
  isUnder13: boolean;
};

type StoreOption = { id: string; name: string };

const REASON_LABELS: Record<DuplicateMatch["match_reasons"][number], string> = {
  phone: "Same phone",
  email: "Same email",
  name: "Same name",
};

/** Register (mode "create") or edit (mode "edit") a customer. Inputs are controlled so nothing is lost on errors. */
export function CustomerForm({
  mode,
  customerId,
  initial,
  stores,
  cancelHref,
}: {
  mode: "create" | "edit";
  customerId?: string;
  initial: CustomerFormValues;
  stores: StoreOption[];
  cancelHref: string;
}) {
  const [state, formAction, isPending] = useActionState<CustomerFormState, FormData>(
    mode === "create" ? registerCustomerAction : updateCustomerAction,
    {},
  );
  const [v, setV] = useState(initial);
  const set = <K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));
  const errors = state.fieldErrors ?? {};
  const emailRequired = v.noMobile && !v.inStoreOnly;

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        // Submit manually (not via the action prop) so React doesn't clear the form afterwards —
        // staff keep what they typed when the duplicate warning or an error appears.
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        const formData = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(formData));
      }}
    >
      {customerId && <input type="hidden" name="customerId" value={customerId} />}
      <FormMessage state={state} />

      {state.duplicates?.length ? (
        <DuplicateWarning duplicates={state.duplicates} mode={mode} pending={isPending} />
      ) : null}

      <Card className="p-5 sm:p-6">
        <SectionTitle title="Customer" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" error={errors.firstName}>
            <Input
              id="firstName"
              name="firstName"
              value={v.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              autoComplete="off"
              autoFocus={mode === "create"}
              aria-invalid={Boolean(errors.firstName)}
              required
            />
          </Field>
          <Field label="Last name" htmlFor="lastName" error={errors.lastName}>
            <Input
              id="lastName"
              name="lastName"
              value={v.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              autoComplete="off"
              aria-invalid={Boolean(errors.lastName)}
              required
            />
          </Field>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionTitle
          title="Contact"
          description={v.isUnder13 ? "Under 13: use a parent or guardian's phone and email." : undefined}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Mobile phone"
            htmlFor="mobile"
            error={errors.mobile}
            hint={v.noMobile ? "Not needed — “No mobile number” is ticked." : undefined}
          >
            <Input
              id="mobile"
              name="mobile"
              type="tel"
              inputMode="tel"
              placeholder="(201) 555-0123"
              value={v.noMobile ? "" : v.mobile}
              onChange={(e) => set("mobile", e.target.value)}
              disabled={v.noMobile}
              autoComplete="off"
              aria-invalid={Boolean(errors.mobile)}
            />
          </Field>
          <Field
            label={emailRequired ? "Email (required)" : "Email (optional)"}
            htmlFor="email"
            error={errors.email}
          >
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              placeholder="name@example.com"
              value={v.email}
              onChange={(e) => set("email", e.target.value)}
              autoComplete="off"
              aria-invalid={Boolean(errors.email)}
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <CheckboxField
            name="noMobile"
            label="No mobile number"
            description="Email becomes required instead."
            checked={v.noMobile}
            onChange={(e) => {
              set("noMobile", e.target.checked);
              if (!e.target.checked) set("inStoreOnly", false);
            }}
          />
          {v.noMobile && (
            <CheckboxField
              name="inStoreOnly"
              label="In-store only"
              description="No phone and no email. They can't use the online portal."
              checked={v.inStoreOnly}
              onChange={(e) => set("inStoreOnly", e.target.checked)}
            />
          )}
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionTitle title="Membership" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Home store" htmlFor="homeLocationId" error={errors.homeLocationId}>
            <Select
              id="homeLocationId"
              name="homeLocationId"
              value={v.homeLocationId}
              onChange={(e) => set("homeLocationId", e.target.value)}
              aria-invalid={Boolean(errors.homeLocationId)}
            >
              {!v.homeLocationId && <option value="">Choose a store…</option>}
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col justify-end">
            <CheckboxField
              name="isUnder13"
              label="Under 13"
              description="Registered by staff with a parent's details."
              checked={v.isUnder13}
              onChange={(e) => set("isUnder13", e.target.checked)}
            />
          </div>
        </div>
        {mode === "create" && (
          <p className="mt-4 text-sm text-muted-foreground">
            A member number (MAX…) is created automatically, and new members start in the Base tier.
          </p>
        )}
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Cancel
        </Link>
        <SubmitButton size="lg" pending={isPending} pendingText={mode === "create" ? "Registering…" : "Saving…"}>
          {mode === "create" ? "Register customer" : "Save changes"}
        </SubmitButton>
      </div>
    </form>
  );
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-bold text-brand-navy-deep">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

function DuplicateWarning({
  duplicates,
  mode,
  pending,
}: {
  duplicates: DuplicateMatch[];
  mode: "create" | "edit";
  pending: boolean;
}) {
  return (
    <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-900">This might be someone who is already a member</p>
          <p className="mt-0.5 text-sm text-amber-900/80">
            Check the matches below. If it&apos;s a different person (for example a family member sharing a phone),
            you can continue.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {duplicates.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white px-3 py-2.5 text-sm ring-1 ring-amber-200">
                <span className="font-semibold">
                  {d.first_name} {d.last_name}
                </span>
                <span className="font-mono text-xs font-semibold text-brand-blue">{d.member_number}</span>
                <span className="text-muted-foreground">{formatPhone(d.mobile_phone) || d.email || ""}</span>
                <span className="flex gap-1">
                  {d.match_reasons.map((r) => (
                    <span key={r} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                      {REASON_LABELS[r]}
                    </span>
                  ))}
                </span>
                <a
                  href={`/staff/customers/${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 font-medium text-brand-blue hover:underline"
                >
                  Open <ExternalLink aria-hidden className="size-3.5" />
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <SubmitButton name="confirmDuplicates" value="1" variant="accent" pending={pending}>
              {mode === "create" ? "It's a different person — register anyway" : "Save anyway"}
            </SubmitButton>
          </div>
        </div>
      </div>
    </div>
  );
}
