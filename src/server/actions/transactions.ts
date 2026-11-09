"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, friendlyDbError, validationFailed } from "@/lib/action-result";
import { allowedTransactionTypes, canVoidTransactions } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { transactionFormData, transactionSchema, voidTransactionSchema } from "@/lib/validation/transaction";
import { requireEmployee } from "@/server/auth";

/**
 * Records one transaction. The database re-checks everything (role, store, dates, refund limits),
 * so this layer only validates the form and turns the typed amount into exact cents.
 */
export async function recordTransactionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const employee = await requireEmployee();
  const parsed = transactionSchema.safeParse(transactionFormData(formData));
  if (!parsed.success) return validationFailed(parsed.error);
  const input = parsed.data;

  if (!allowedTransactionTypes(employee.role).includes(input.type)) {
    return { error: "You don't have permission to record that type of transaction." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_transaction", {
    p_customer_id: input.customerId,
    p_location_id: input.locationId,
    p_type: input.type,
    p_amount_cents: input.amountCents,
    p_occurred_at: input.occurredAt,
    p_note: input.note,
    p_refund_of: input.refundOf,
    p_adjustment_direction: input.direction,
    p_counts_toward_tier: input.countsTowardTier,
  });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath(`/staff/customers/${input.customerId}`);
  redirect(`/staff/customers/${input.customerId}?recorded=1`);
}

/** Owner only. Never deletes — the row stays, marked void, with the reason. */
export async function voidTransactionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const employee = await requireEmployee(["owner"]);
  if (!canVoidTransactions(employee.role)) return { error: "You don't have permission to do that." };

  const parsed = voidTransactionSchema.safeParse({
    transactionId: formData.get("transactionId"),
    customerId: formData.get("customerId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_transaction", {
    p_id: parsed.data.transactionId,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath(`/staff/customers/${parsed.data.customerId}`);
  return { ok: true, message: "Transaction voided." };
}
