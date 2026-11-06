"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, friendlyDbError, validationFailed } from "@/lib/action-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { locationSchema, updateLocationSchema } from "@/lib/validation/staff";
import { requireEmployee } from "@/server/auth";

export async function createStoreAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee(["owner"]);
  const parsed = locationSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    address: formData.get("address") ?? "",
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_location", {
    p_name: parsed.data.name,
    p_code: parsed.data.code,
    p_address: parsed.data.address,
  });
  if (error) {
    return error.code === "23505"
      ? { error: "That store code is already used.", fieldErrors: { code: ["Already used."] } }
      : { error: friendlyDbError(error) };
  }

  revalidatePath("/staff", "layout");
  return { ok: true, message: `Store "${parsed.data.name}" added.` };
}

export async function updateStoreAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee(["owner"]);
  const parsed = updateLocationSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    code: formData.get("code"),
    address: formData.get("address") ?? "",
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_location", {
    p_id: parsed.data.id,
    p_name: parsed.data.name,
    p_code: parsed.data.code,
    p_address: parsed.data.address,
    p_is_active: parsed.data.isActive,
  });
  if (error) {
    return error.code === "23505"
      ? { error: "That store code is already used.", fieldErrors: { code: ["Already used."] } }
      : { error: friendlyDbError(error) };
  }

  revalidatePath("/staff", "layout");
  return { ok: true, message: "Store saved." };
}
