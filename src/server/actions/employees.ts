"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, friendlyDbError, validationFailed } from "@/lib/action-result";
import { serverEnv } from "@/lib/env.server";
import { canChangeActive, canChangeRole, canInvite } from "@/lib/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { employeeIdSchema, inviteEmployeeSchema, roleSchema } from "@/lib/validation/staff";
import { requireEmployee } from "@/server/auth";

/** ~100 years: Supabase's way of blocking sign-in for a deactivated user. */
const BAN_FOREVER = "876000h";

/**
 * Invite flow:
 *  1. Supabase Auth creates the user and emails the invite link (admin API).
 *  2. The database function creates the employee record — it re-checks the caller's
 *     permission and writes the audit log. If it refuses, the new auth user is removed.
 */
export async function inviteEmployeeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireEmployee(["owner", "manager"]);
  const parsed = inviteEmployeeSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    role: formData.get("role"),
    locationIds: formData.getAll("locationIds"),
  });
  if (!parsed.success) return validationFailed(parsed.error);
  const input = parsed.data;

  if (!canInvite(actor.role, input.role)) return { error: "You can't invite someone with that role." };
  if (input.role !== "owner" && input.locationIds.length === 0) {
    return { error: "Choose at least one store.", fieldErrors: { locationIds: ["Choose at least one store."] } };
  }

  const admin = createSupabaseAdminClient();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: `${serverEnv().NEXT_PUBLIC_SITE_URL}/staff/set-password`,
    data: { first_name: input.firstName, last_name: input.lastName },
  });
  if (inviteError || !invited.user) {
    const exists = inviteError?.code === "email_exists" || /already/i.test(inviteError?.message ?? "");
    return exists
      ? { error: "That email already has an account.", fieldErrors: { email: ["Already has an account."] } }
      : { error: "Couldn't send the invite. Please try again." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_employee_record", {
    p_user_id: invited.user.id,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_email: input.email,
    p_role: input.role,
    p_location_ids: input.locationIds,
  });
  if (error) {
    await admin.auth.admin.deleteUser(invited.user.id);
    return { error: friendlyDbError(error) };
  }

  revalidatePath("/staff/employees");
  return { ok: true, message: `Invite sent to ${input.email}.` };
}

export async function changeRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireEmployee(["owner"]);
  const id = employeeIdSchema.safeParse(formData.get("employeeId"));
  const role = roleSchema.safeParse(formData.get("role"));
  if (!id.success || !role.success) return { error: "Choose a valid role." };
  if (!canChangeRole(actor.role, id.data === actor.id)) return { error: "You can't change this role." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_employee_role", { p_employee_id: id.data, p_role: role.data });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/staff/employees");
  return { ok: true, message: "Role updated." };
}

export async function setActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireEmployee(["owner"]);
  const id = employeeIdSchema.safeParse(formData.get("employeeId"));
  const makeActive = formData.get("makeActive") === "true";
  if (!id.success) return { error: "Something went wrong. Please try again." };
  if (!canChangeActive(actor.role, id.data === actor.id)) return { error: "You can't change this account." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_employee_active", {
    p_employee_id: id.data,
    p_is_active: makeActive,
  });
  if (error) return { error: friendlyDbError(error) };

  // Block (or unblock) sign-in at the auth level too, so existing sessions can't be refreshed.
  const admin = createSupabaseAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(id.data, {
    ban_duration: makeActive ? "none" : BAN_FOREVER,
  });
  if (banError) {
    return {
      error: makeActive
        ? "Reactivated, but sign-in couldn't be unblocked. Please try again."
        : "Deactivated (they can't use the app), but sign-in blocking failed. Please try again.",
    };
  }

  revalidatePath("/staff/employees");
  return { ok: true, message: makeActive ? "Account reactivated." : "Account deactivated." };
}

export async function setStoresAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee(["owner", "manager"]);
  const id = employeeIdSchema.safeParse(formData.get("employeeId"));
  if (!id.success) return { error: "Something went wrong. Please try again." };
  const locationIds = formData.getAll("locationIds").map(String);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_employee_locations", {
    p_employee_id: id.data,
    p_location_ids: locationIds,
  });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/staff/employees");
  return { ok: true, message: "Stores updated." };
}
