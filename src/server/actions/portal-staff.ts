"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, friendlyDbError, validationFailed } from "@/lib/action-result";
import { canManagePortalAccess } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { staffReasonSchema } from "@/lib/validation/portal";
import { requireEmployee } from "@/server/auth";

async function run(
  formData: FormData,
  options: { needReason: boolean },
  call: (customerId: string, reason: string) => PromiseLike<{ error: { code?: string; message?: string } | null }>,
  done: string,
): Promise<ActionState> {
  const employee = await requireEmployee();
  if (!canManagePortalAccess(employee.role)) return { error: "Only the Owner or a Manager can do this." };

  const parsed = staffReasonSchema.safeParse({ customerId: formData.get("customerId"), reason: formData.get("reason") });
  if (!parsed.success) return validationFailed(parsed.error);
  if (options.needReason && !parsed.data.reason) {
    return { error: "Please fix the highlighted fields.", fieldErrors: { reason: ["Please give a reason."] } };
  }

  const { error } = await call(parsed.data.customerId, parsed.data.reason);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/staff/customers/${parsed.data.customerId}`);
  return { ok: true, message: done };
}

/** Owner/Manager: a member forgot their PIN. They set a new one in the member page. */
export async function resetPinAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createSupabaseServerClient();
  return run(
    formData,
    { needReason: false },
    (id, reason) => supabase.rpc("reset_customer_pin", { p_customer_id: id, p_reason: reason || null }),
    "PIN removed. The member can set a new one in the member page.",
  );
}

/** Owner/Manager: connect the member to the online login that uses their email (shared-email case). */
export async function linkLoginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createSupabaseServerClient();
  return run(formData, { needReason: false }, (id) => supabase.rpc("link_customer_login", { p_customer_id: id }), "Online login linked.");
}

/** Owner/Manager: remove the online login (changed or lost email). */
export async function unlinkLoginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createSupabaseServerClient();
  return run(
    formData,
    { needReason: true },
    (id, reason) => supabase.rpc("unlink_customer_login", { p_customer_id: id, p_reason: reason }),
    "Online login removed.",
  );
}

/** Any employee: save the PIN the customer just chose on the number pad. Never logged. */
export async function setCustomerPinAction(customerId: string, pin: string): Promise<ActionState> {
  await requireEmployee();
  const id = staffReasonSchema.shape.customerId.safeParse(customerId);
  if (!id.success || !/^[0-9]{6,12}$/.test(String(pin))) return { error: "A PIN must be 6 to 12 numbers." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("staff_set_customer_pin", { p_customer_id: id.data, p_pin: pin });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/staff/customers/${id.data}`);
  return { ok: true, message: "PIN saved." };
}
