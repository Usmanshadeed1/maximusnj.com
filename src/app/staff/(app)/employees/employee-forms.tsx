"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, MapPin, Power, RefreshCw, Shield, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui/form";
import { type ActionState, idleState } from "@/lib/action-result";
import { generatePassword } from "@/lib/password";
import { ALL_ROLES, ROLE_LABELS, requiresStore } from "@/lib/permissions";
import {
  changeRoleAction,
  createEmployeeAction,
  inviteEmployeeAction,
  setActiveAction,
  setStoresAction,
} from "@/server/actions/employees";
import type { EmployeeRole } from "@/types/database";

type StoreOption = { id: string; name: string; code: string };

/** Closes the surrounding dialog once the action succeeds. */
function useCloseOnSuccess(state: ActionState) {
  const { close } = useDialog();
  useEffect(() => {
    if (state.ok) close();
  }, [state.ok, close]);
  return close;
}

function StoreCheckboxes({
  stores,
  defaultSelected = [],
  error,
}: {
  stores: StoreOption[];
  defaultSelected?: string[];
  error?: string[];
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Stores</legend>
      {stores.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active stores available.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {stores.map((store) => (
            <label
              key={store.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-input bg-white px-3 text-sm transition-colors hover:border-brand-navy/60 has-checked:border-brand-blue has-checked:bg-secondary/60"
            >
              <input
                type="checkbox"
                name="locationIds"
                value={store.id}
                defaultChecked={defaultSelected.includes(store.id)}
                className="size-4 accent-brand-blue"
              />
              <span>
                {store.name} <span className="text-xs text-muted-foreground">{store.code}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {error?.length ? <p className="text-xs font-medium text-destructive">{error[0]}</p> : null}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------
// Invite
// ---------------------------------------------------------------------------------------

export function InviteEmployeeDialog({ roles, stores }: { roles: EmployeeRole[]; stores: StoreOption[] }) {
  if (roles.length === 0) return null;
  return (
    <Dialog
      title="Invite a team member"
      description="They'll get an email with a link to choose their password."
      trigger={(open) => (
        <Button onClick={open}>
          <UserPlus aria-hidden /> Invite
        </Button>
      )}
    >
      <InviteForm roles={roles} stores={stores} />
    </Dialog>
  );
}

function InviteForm({ roles, stores }: { roles: EmployeeRole[]; stores: StoreOption[] }) {
  const [state, formAction] = useActionState(inviteEmployeeAction, idleState);
  const close = useCloseOnSuccess(state);
  const [role, setRole] = useState<EmployeeRole>(roles.includes("staff") ? "staff" : roles[0]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" error={state.fieldErrors?.firstName}>
          <Input id="firstName" name="firstName" autoComplete="off" required autoFocus />
        </Field>
        <Field label="Last name" htmlFor="lastName" error={state.fieldErrors?.lastName}>
          <Input id="lastName" name="lastName" autoComplete="off" required />
        </Field>
      </div>
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="off" required />
      </Field>
      <Field label="Role" htmlFor="role" error={state.fieldErrors?.role}>
        <Select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value as EmployeeRole)}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </Field>
      {requiresStore(role) ? (
        <StoreCheckboxes stores={stores} error={state.fieldErrors?.locationIds} />
      ) : (
        <p className="rounded-md bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">
          Owners have access to every store.
        </p>
      )}
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton pendingText="Sending invite…">Send invite</SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------
// Create (Owner only): the account works immediately, no email needed
// ---------------------------------------------------------------------------------------

export function CreateEmployeeDialog({ roles, stores }: { roles: EmployeeRole[]; stores: StoreOption[] }) {
  return (
    <Dialog
      title="Create an employee"
      description="Make the account yourself. You choose the password and pass it on — no email needed."
      trigger={(open) => (
        <Button variant="outline" onClick={open}>
          <KeyRound aria-hidden /> Create employee
        </Button>
      )}
    >
      <CreateForm roles={roles} stores={stores} />
    </Dialog>
  );
}

function CreateForm({ roles, stores }: { roles: EmployeeRole[]; stores: StoreOption[] }) {
  const [state, formAction, isPending] = useActionState(createEmployeeAction, idleState);
  const { close } = useDialog();
  const [role, setRole] = useState<EmployeeRole>(roles.includes("staff") ? "staff" : roles[0]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  if (state.ok) {
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(`Email: ${email.trim().toLowerCase()}\nPassword: ${password}`);
        setCopied(true);
      } catch {
        // Clipboard can be blocked; the details are on screen to copy by hand.
      }
    };
    return (
      <div className="flex flex-col gap-4">
        <FormMessage state={state} />
        <div className="rounded-lg border bg-secondary/50 p-4 text-sm">
          <p className="font-semibold">Give them these sign-in details</p>
          <dl className="mt-3 grid grid-cols-[5rem_1fr] gap-y-2">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium break-all">{email.trim().toLowerCase()}</dd>
            <dt className="text-muted-foreground">Password</dt>
            <dd className="font-mono font-semibold break-all">{password}</dd>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            This is the only time the password is shown. They can change it later with “Forgot your password?”.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={copy}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copied" : "Copy details"}
          </Button>
          <Button onClick={close}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        // Submit manually so React doesn't clear the form when there's an error to fix.
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="c-firstName" error={state.fieldErrors?.firstName}>
          <Input id="c-firstName" name="firstName" autoComplete="off" required autoFocus />
        </Field>
        <Field label="Last name" htmlFor="c-lastName" error={state.fieldErrors?.lastName}>
          <Input id="c-lastName" name="lastName" autoComplete="off" required />
        </Field>
      </div>
      <Field label="Email" htmlFor="c-email" error={state.fieldErrors?.email}>
        <Input
          id="c-email"
          name="email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>
      <Field
        label="Password"
        htmlFor="c-password"
        error={state.fieldErrors?.password}
        hint="At least 10 characters. Generate one, or type your own."
      >
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="c-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-11 font-mono"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setPassword(generatePassword());
              setShowPassword(true);
            }}
          >
            <RefreshCw aria-hidden /> Generate
          </Button>
        </div>
      </Field>
      <Field label="Role" htmlFor="c-role" error={state.fieldErrors?.role}>
        <Select id="c-role" name="role" value={role} onChange={(e) => setRole(e.target.value as EmployeeRole)}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </Field>
      {requiresStore(role) ? (
        <StoreCheckboxes stores={stores} error={state.fieldErrors?.locationIds} />
      ) : (
        <p className="rounded-md bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">
          Owners have access to every store.
        </p>
      )}
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton pending={isPending} pendingText="Creating…">
          Create account
        </SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------
// Row actions
// ---------------------------------------------------------------------------------------

type EmployeeSummary = {
  id: string;
  name: string;
  role: EmployeeRole;
  isActive: boolean;
  locationIds: string[];
};

export function EmployeeActions({
  employee,
  stores,
  can,
}: {
  employee: EmployeeSummary;
  stores: StoreOption[];
  can: { changeRole: boolean; changeActive: boolean; editStores: boolean };
}) {
  if (!can.changeRole && !can.changeActive && !can.editStores) return null;

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {can.editStores && employee.isActive && (
        <Dialog
          title={`Stores for ${employee.name}`}
          trigger={(open) => (
            <Button variant="ghost" size="sm" onClick={open}>
              <MapPin aria-hidden /> Stores
            </Button>
          )}
        >
          <StoresForm employee={employee} stores={stores} />
        </Dialog>
      )}
      {can.changeRole && employee.isActive && (
        <Dialog
          title={`Change role for ${employee.name}`}
          trigger={(open) => (
            <Button variant="ghost" size="sm" onClick={open}>
              <Shield aria-hidden /> Role
            </Button>
          )}
        >
          <RoleForm employee={employee} />
        </Dialog>
      )}
      {can.changeActive && (
        <Dialog
          title={employee.isActive ? `Deactivate ${employee.name}?` : `Reactivate ${employee.name}?`}
          trigger={(open) => (
            <Button variant="ghost" size="sm" onClick={open} className={employee.isActive ? "text-destructive" : undefined}>
              <Power aria-hidden /> {employee.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          )}
        >
          <ActiveForm employee={employee} />
        </Dialog>
      )}
    </div>
  );
}

function StoresForm({ employee, stores }: { employee: EmployeeSummary; stores: StoreOption[] }) {
  const [state, formAction] = useActionState(setStoresAction, idleState);
  const close = useCloseOnSuccess(state);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="employeeId" value={employee.id} />
      <StoreCheckboxes stores={stores} defaultSelected={employee.locationIds} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton>Save stores</SubmitButton>
      </div>
    </form>
  );
}

function RoleForm({ employee }: { employee: EmployeeSummary }) {
  const [state, formAction] = useActionState(changeRoleAction, idleState);
  const close = useCloseOnSuccess(state);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="employeeId" value={employee.id} />
      <Field label="Role" htmlFor="role">
        <Select id="role" name="role" defaultValue={employee.role}>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-sm text-muted-foreground">
        Owners can do everything. Managers run their stores and invite Staff. Staff handle customers at the
        counter.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton>Save role</SubmitButton>
      </div>
    </form>
  );
}

function ActiveForm({ employee }: { employee: EmployeeSummary }) {
  const [state, formAction] = useActionState(setActiveAction, idleState);
  const close = useCloseOnSuccess(state);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="employeeId" value={employee.id} />
      <input type="hidden" name="makeActive" value={String(!employee.isActive)} />
      <p className="text-sm">
        {employee.isActive
          ? "They will be signed out and won't be able to sign in until reactivated. Their history is kept."
          : "They will be able to sign in again with their existing password."}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton variant={employee.isActive ? "destructive" : "default"}>
          {employee.isActive ? "Deactivate" : "Reactivate"}
        </SubmitButton>
      </div>
    </form>
  );
}
