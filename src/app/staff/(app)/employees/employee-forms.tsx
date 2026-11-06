"use client";

import { useActionState, useEffect, useState } from "react";
import { MapPin, Power, Shield, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui/form";
import { type ActionState, idleState } from "@/lib/action-result";
import { ALL_ROLES, ROLE_LABELS, requiresStore } from "@/lib/permissions";
import { changeRoleAction, inviteEmployeeAction, setActiveAction, setStoresAction } from "@/server/actions/employees";
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
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm has-checked:border-brand-blue has-checked:bg-secondary/60"
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
