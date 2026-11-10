"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, friendlyDbError, validationFailed } from "@/lib/action-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { customerFormData, customerSchema, mergeSchema, statusChangeSchema } from "@/lib/validation/customer";
import { requireEmployee } from "@/server/auth";
import type { DuplicateMatch } from "@/types/database";

export type CustomerFormState = ActionState & { duplicates?: DuplicateMatch[] };

/**
 * Registers a customer. The first submit checks for possible duplicates (§5.4) and, if any,
 * returns them so staff can review; submitting again with "Register anyway" skips the check.
 */
export async function registerCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  await requireEmployee();
  const parsed = customerSchema.safeParse(customerFormData(formData));
  if (!parsed.success) return validationFailed(parsed.error);
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();

  if (formData.get("confirmDuplicates") !== "1") {
    const { data: duplicates } = await supabase.rpc("find_customer_duplicates", {
      p_mobile: input.mobile,
      p_email: input.email,
      p_first_name: input.firstName,
      p_last_name: input.lastName,
    });
    if (duplicates?.length) return { duplicates };
  }

  const { data: customer, error } = await supabase.rpc("register_customer", {
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_mobile: input.mobile,
    p_no_mobile: input.noMobile,
    p_email: input.email,
    p_home_location_id: input.homeLocationId,
    p_is_under_13: input.isUnder13,
  });
  if (error || !customer) return { error: friendlyDbError(error) };

  // The PIN the customer chose on the number pad (optional). If it can't be used (for example
  // someone already has it), the member is still registered and the profile says so.
  const pin = String(formData.get("pin") ?? "");
  let pinNote = "";
  if (pin) {
    const { error: pinError } = /^[0-9]{6,12}$/.test(pin)
      ? await supabase.rpc("staff_set_customer_pin", { p_customer_id: customer.id, p_pin: pin })
      : { error: { message: "pin_invalid" } };
    pinNote = pinError ? `&pin=${encodeURIComponent(friendlyDbError(pinError))}` : "&pin=ok";
  }

  revalidatePath("/staff/customers");
  redirect(`/staff/customers/${customer.id}?new=1${pinNote}`);
}

export async function updateCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  await requireEmployee();
  const id = String(formData.get("customerId") ?? "");
  const parsed = customerSchema.safeParse(customerFormData(formData));
  if (!parsed.success) return validationFailed(parsed.error);
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();

  if (formData.get("confirmDuplicates") !== "1") {
    const { data: duplicates } = await supabase.rpc("find_customer_duplicates", {
      p_mobile: input.mobile,
      p_email: input.email,
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_exclude_id: id,
    });
    if (duplicates?.length) return { duplicates };
  }

  const { error } = await supabase.rpc("update_customer", {
    p_id: id,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_mobile: input.mobile,
    p_no_mobile: input.noMobile,
    p_email: input.email,
    p_home_location_id: input.homeLocationId,
    p_is_under_13: input.isUnder13,
  });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/staff/customers");
  redirect(`/staff/customers/${id}?saved=1`);
}

export async function setCustomerStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee(["owner", "manager"]);
  const parsed = statusChangeSchema.safeParse({
    customerId: formData.get("customerId"),
    status: formData.get("status"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { error: "Something went wrong. Please try again." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_customer_status", {
    p_id: parsed.data.customerId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason || null,
  });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath(`/staff/customers/${parsed.data.customerId}`);
  return { ok: true, message: parsed.data.status === "active" ? "Member reactivated." : "Member deactivated." };
}

export type MergeState = ActionState & {
  confirm?: { targetId: string; memberNumber: string; name: string; reason: string };
};

/**
 * Owner only. Step 1: look up the member to keep and ask for confirmation.
 * Step 2 (confirmTargetId present): merge and go to the surviving record.
 */
export async function mergeCustomerAction(_prev: MergeState, formData: FormData): Promise<MergeState> {
  await requireEmployee(["owner"]);
  const parsed = mergeSchema.safeParse({
    sourceId: formData.get("sourceId"),
    targetMemberNumber: formData.get("targetMemberNumber"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return validationFailed(parsed.error);
  const { sourceId, targetMemberNumber, reason } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data: target } = await supabase
    .from("customers")
    .select("id, member_number, first_name, last_name, merged_into_id")
    .eq("member_number", targetMemberNumber)
    .maybeSingle();
  if (!target) {
    return { error: "No member has that number.", fieldErrors: { targetMemberNumber: ["Not found."] } };
  }
  if (target.id === sourceId) return { error: "Choose a different member to keep." };
  if (target.merged_into_id) return { error: "That member was already merged into another record." };

  const confirmTargetId = formData.get("confirmTargetId");
  if (confirmTargetId !== target.id) {
    return {
      confirm: {
        targetId: target.id,
        memberNumber: target.member_number,
        name: `${target.first_name} ${target.last_name}`,
        reason,
      },
    };
  }

  const { error } = await supabase.rpc("merge_customers", {
    p_source_id: sourceId,
    p_target_id: target.id,
    p_reason: reason,
  });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/staff/customers");
  redirect(`/staff/customers/${target.id}?merged=1`);
}
