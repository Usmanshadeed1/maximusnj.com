"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, friendlyDbError, validationFailed } from "@/lib/action-result";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/server/auth";

const schema = z.object({
  customerId: z.uuid(),
  memberNumber: z.string().trim().toUpperCase(),
  confirm: z.string().trim().toUpperCase(),
  reason: z.string().trim().min(3, "Please give a reason.").max(300),
});

/**
 * Owner only (§13): removes a member's personal details and online access, after they ask.
 * The Owner must type the member number to confirm. Sales and visits stay under the member number.
 */
export async function anonymizeCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee(["owner"]);
  const parsed = schema.safeParse({
    customerId: formData.get("customerId"),
    memberNumber: formData.get("memberNumber"),
    confirm: formData.get("confirm"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return validationFailed(parsed.error);
  if (parsed.data.confirm !== parsed.data.memberNumber) {
    return { error: "Please fix the highlighted fields.", fieldErrors: { confirm: ["That doesn't match the member number."] } };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("anonymize_customer", { p_customer_id: parsed.data.customerId, p_reason: parsed.data.reason });
  if (error || !data) return { error: friendlyDbError(error) };

  // Their sign-in account (email) is removed too, unless it belongs to a staff member.
  if (data.auth_user_id) {
    const { data: employee } = await supabase.from("employees").select("id").eq("id", data.auth_user_id).maybeSingle();
    if (!employee) await createSupabaseAdminClient().auth.admin.deleteUser(data.auth_user_id);
  }
  revalidatePath(`/staff/customers/${parsed.data.customerId}`);
  revalidatePath("/staff/customers");
  return { ok: true, message: "Personal details removed." };
}
