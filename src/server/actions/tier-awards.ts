"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, friendlyDbError, validationFailed } from "@/lib/action-result";
import { formatMonthYear } from "@/lib/format";
import { canManageTiers } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/server/auth";
import type { RolloverResult } from "@/types/database";

const monthSchema = z.string().regex(/^\d{4}-\d{2}-01$/, "Choose a month.");

function describeRun(result: RolloverResult): ActionState {
  if (result.status === "already_running") {
    return { error: "An update is already running. Wait a moment and look at the list below." };
  }
  if (result.status === "failed") {
    return { error: `The update didn't finish: ${result.error ?? "unknown problem"}. It will try again within the hour.` };
  }
  const decided = result.processed ?? 0;
  const left = result.skipped ?? 0;
  const month = formatMonthYear(result.awarded_month);
  return {
    ok: true,
    message:
      decided === 0 && left > 0
        ? `Nothing to do — everyone already has their ${month} tier.`
        : `Done. ${decided} ${decided === 1 ? "member was" : "members were"} given a ${month} tier${left > 0 ? `, and ${left} already had one` : ""}.`,
  };
}

/** Owner only. Completes THIS month's update. Safe to press at any time. */
export async function runMonthlyUpdateNowAction(): Promise<ActionState> {
  const employee = await requireEmployee(["owner"]);
  if (!canManageTiers(employee.role)) return { error: "You don't have permission to do that." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("run_month_rollover_now");
  if (error || !data) return { error: friendlyDbError(error) };

  revalidatePath("/staff", "layout");
  return describeRun(data);
}

/** Owner only, and only on a site with test tools switched on. Simulates a month-end. */
export async function runTestUpdateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const employee = await requireEmployee(["owner"]);
  if (!canManageTiers(employee.role)) return { error: "You don't have permission to do that." };

  const month = monthSchema.safeParse(formData.get("month"));
  if (!month.success) return { error: "Choose a month.", fieldErrors: { month: [month.error.issues[0].message] } };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("run_test_rollover", { p_awarded_month: month.data });
  if (error || !data) return { error: friendlyDbError(error) };

  revalidatePath("/staff", "layout");
  const result = describeRun(data);
  return result.ok ? { ...result, message: `Test run finished. ${result.message}` } : result;
}

const recalculateSchema = z.object({
  month: monthSchema,
  reason: z.string().trim().min(3, "Say why you are recalculating.").max(300, "Keep the reason under 300 characters."),
  customerId: z.string().default(""),
});

/** Owner only. Re-decides a finished month; replaced results are kept in the history. */
export async function recalculateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const employee = await requireEmployee(["owner"]);
  if (!canManageTiers(employee.role)) return { error: "You don't have permission to do that." };

  const parsed = recalculateSchema.safeParse({
    month: formData.get("month"),
    reason: formData.get("reason"),
    customerId: formData.get("customerId") ?? "",
  });
  if (!parsed.success) return validationFailed(parsed.error);
  const customerId = parsed.data.customerId && z.uuid().safeParse(parsed.data.customerId).success ? parsed.data.customerId : null;
  if (parsed.data.customerId && !customerId) return { error: "Something went wrong. Please try again." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("recalculate_awards", {
    p_awarded_month: parsed.data.month,
    p_reason: parsed.data.reason,
    p_customer_id: customerId,
  });
  if (error || !data) return { error: friendlyDbError(error) };

  revalidatePath("/staff", "layout");
  const month = formatMonthYear(data.awarded_month);
  return {
    ok: true,
    message:
      data.changed === 0
        ? `Checked ${data.members} ${data.members === 1 ? "member" : "members"} for ${month}. Nothing needed to change.`
        : `${month}: ${data.changed} of ${data.members} ${data.members === 1 ? "member" : "members"} got a new result. The old results are kept in their history.`,
  };
}
