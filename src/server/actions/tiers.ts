"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, friendlyDbError, validationFailed } from "@/lib/action-result";
import { formatCalendarDate } from "@/lib/format";
import { canManageTiers } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  clearTierOverrideSchema,
  setTierOverrideSchema,
  tierSettingsFormData,
  tierSettingsSchema,
} from "@/lib/validation/tier";
import { requireEmployee } from "@/server/auth";

/** Owner only. Saves a NEW version of the rules that starts next month — this month is never changed. */
export async function saveTierRulesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const employee = await requireEmployee(["owner"]);
  if (!canManageTiers(employee.role)) return { error: "You don't have permission to do that." };

  const parsed = tierSettingsSchema.safeParse(tierSettingsFormData(formData));
  if (!parsed.success) return validationFailed(parsed.error);
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_tier_rules", {
    p_visit_value_cents: input.visitValueCents,
    p_lookback_months: input.lookbackMonths,
    p_lookback_method: input.method,
    p_carry_over: input.carryOver,
    p_require_purchase: input.requirePurchase,
    p_require_visit: input.requireVisit,
    p_tiers: input.tiers,
  });
  if (error || !data) return { error: friendlyDbError(error) };

  revalidatePath("/staff", "layout");
  return {
    ok: true,
    message: `Saved as version ${data.version}. It takes effect on ${formatCalendarDate(data.effective_from_month)}.`,
  };
}

/** Owner only. Sets a customer's tier by hand, with a reason and an optional end month. */
export async function setTierOverrideAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const employee = await requireEmployee(["owner"]);
  if (!canManageTiers(employee.role)) return { error: "You don't have permission to do that." };

  const parsed = setTierOverrideSchema.safeParse({
    customerId: formData.get("customerId"),
    tier: formData.get("tier"),
    reason: formData.get("reason"),
    endMode: formData.get("endMode") ?? "none",
    endMonth: formData.get("endMonth") ?? "",
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_tier_override", {
    p_customer_id: parsed.data.customerId,
    p_tier: parsed.data.tier,
    p_reason: parsed.data.reason,
    p_last_month: parsed.data.lastMonth,
  });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath(`/staff/customers/${parsed.data.customerId}`);
  return { ok: true, message: "Tier set." };
}

export async function clearTierOverrideAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const employee = await requireEmployee(["owner"]);
  if (!canManageTiers(employee.role)) return { error: "You don't have permission to do that." };

  const parsed = clearTierOverrideSchema.safeParse({
    customerId: formData.get("customerId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("clear_tier_override", {
    p_customer_id: parsed.data.customerId,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath(`/staff/customers/${parsed.data.customerId}`);
  return { ok: true, message: "Override removed." };
}
