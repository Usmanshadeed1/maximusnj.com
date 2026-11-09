"use client";

import { startTransition, useActionState, useState } from "react";
import { CheckboxField, Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { memberSignOutAction, memberSignUpAction } from "@/server/actions/portal";

export function JoinForm({ email, stores }: { email: string; stores: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(memberSignUpAction, idleState);
  const errors = state.fieldErrors ?? {};
  const [values, setValues] = useState({ firstName: "", lastName: "", mobile: "", homeLocationId: "", age13: false });
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          // Submit by hand so React doesn't clear what was typed if something needs fixing.
          startTransition(() => formAction(new FormData(e.currentTarget)));
        }}
      >
        <FormMessage state={state} />
        <Field label="Email (confirmed)" htmlFor="email">
          <Input id="email" value={email} readOnly disabled className="h-12 text-base" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" error={errors.firstName}>
            <Input
              id="firstName"
              name="firstName"
              autoComplete="given-name"
              value={values.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              aria-invalid={Boolean(errors.firstName)}
              className="h-12 text-base"
              required
              autoFocus
            />
          </Field>
          <Field label="Last name" htmlFor="lastName" error={errors.lastName}>
            <Input
              id="lastName"
              name="lastName"
              autoComplete="family-name"
              value={values.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              aria-invalid={Boolean(errors.lastName)}
              className="h-12 text-base"
              required
            />
          </Field>
        </div>
        <Field label="Mobile phone" htmlFor="mobile" error={errors.mobile}>
          <Input
            id="mobile"
            name="mobile"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(201) 555-0123"
            value={values.mobile}
            onChange={(e) => set("mobile", e.target.value)}
            aria-invalid={Boolean(errors.mobile)}
            className="h-12 text-base"
            required
          />
        </Field>
        <Field label="Home store" htmlFor="homeLocationId" error={errors.homeLocationId}>
          <Select
            id="homeLocationId"
            name="homeLocationId"
            value={values.homeLocationId}
            onChange={(e) => set("homeLocationId", e.target.value)}
            aria-invalid={Boolean(errors.homeLocationId)}
            className="h-12 text-base"
            required
          >
            <option value="">Choose your store…</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <CheckboxField
            name="age13"
            label="I am 13 years old or older"
            description="Children under 13 can be signed up by a parent in one of our stores."
            checked={values.age13}
            onChange={(e) => set("age13", e.target.checked)}
          />
          {errors.age13?.[0] && <p className="mt-1.5 text-sm font-medium text-destructive">{errors.age13[0]}</p>}
        </div>
        <SubmitButton size="lg" className="w-full" pending={pending} pendingText="Creating your membership…">
          Create my membership
        </SubmitButton>
      </form>
      <form action={memberSignOutAction} className="mt-4 text-center">
        <button type="submit" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Use a different email
        </button>
      </form>
    </>
  );
}
