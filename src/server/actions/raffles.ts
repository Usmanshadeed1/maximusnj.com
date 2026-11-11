"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, friendlyDbError, validationFailed } from "@/lib/action-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  cancelRaffleSchema,
  raffleFormData,
  raffleSettingsSchema,
  releaseFormData,
  releaseSchema,
  removeEntrySchema,
} from "@/lib/validation/raffle";
import { requireEmployee } from "@/server/auth";

/** Saves the products a new raffle offers. Returns false if that failed (the raffle itself is kept as a draft). */
async function saveProducts(raffleIds: string[], formData: FormData): Promise<boolean> {
  const productIds = formData.getAll("productIds").map(String).filter((v) => z.uuid().safeParse(v).success);
  if (productIds.length === 0) return true;
  const supabase = await createSupabaseServerClient();
  for (const id of raffleIds) {
    const { error } = await supabase.rpc("set_raffle_products", { p_raffle_id: id, p_product_ids: productIds });
    if (error) return false;
  }
  return true;
}

function setupArgs(input: z.output<typeof raffleSettingsSchema>) {
  return {
    p_pickup_rule: input.pickupRule,
    p_pickup_location_id: input.pickupLocationId,
    // No "number of winners": the draw only ranks everyone (staff pick people from the top).
    p_winner_count: null,
    p_opens_at: input.opensAt,
    p_closes_at: input.closesAt,
    p_claim_hours: input.claimHours,
    p_channels: input.channels,
  };
}

/** Creates a release and its raffles (as drafts) in one step. */
export async function createReleaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee(["owner", "manager"]);
  const release = releaseSchema.safeParse(releaseFormData(formData));
  const raffle = raffleSettingsSchema.safeParse(raffleFormData(formData));
  if (!release.success || !raffle.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: {
        ...(release.success ? {} : z.flattenError(release.error).fieldErrors),
        ...(raffle.success ? {} : z.flattenError(raffle.error).fieldErrors),
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_release_with_raffles", {
    p_name: release.data.name,
    p_description: release.data.description || null,
    p_image_url: release.data.imageUrl || null,
    p_release_date: release.data.releaseDate || null,
    p_scope: raffle.data.scope,
    p_location_ids: raffle.data.locationIds,
    ...setupArgs(raffle.data),
  });
  if (error || !data) return { error: friendlyDbError(error) };
  const productsSaved = await saveProducts(data.raffle_ids, formData);
  revalidatePath("/staff/raffles");
  redirect(`/staff/raffles/${data.release_id}?created=1${productsSaved ? "" : "&products=failed"}`);
}

/** Adds more raffles (for example another store) to an existing release. */
export async function addRafflesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee(["owner", "manager"]);
  const releaseId = z.uuid().safeParse(formData.get("releaseId"));
  const raffle = raffleSettingsSchema.safeParse(raffleFormData(formData));
  if (!releaseId.success) return { error: "That release no longer exists." };
  if (!raffle.success) return validationFailed(raffle.error);

  const supabase = await createSupabaseServerClient();
  const { data: added, error } = await supabase.rpc("add_raffles_to_release", {
    p_release_id: releaseId.data,
    p_scope: raffle.data.scope,
    p_location_ids: raffle.data.locationIds,
    ...setupArgs(raffle.data),
  });
  if (error || !added) return { error: friendlyDbError(error) };
  const productsSaved = await saveProducts(added.raffle_ids, formData);
  revalidatePath(`/staff/raffles/${releaseId.data}`);
  redirect(`/staff/raffles/${releaseId.data}?added=1${productsSaved ? "" : "&products=failed"}`);
}

export async function updateReleaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee(["owner", "manager"]);
  const id = z.uuid().safeParse(formData.get("releaseId"));
  const release = releaseSchema.safeParse(releaseFormData(formData));
  if (!id.success) return { error: "That release no longer exists." };
  if (!release.success) return validationFailed(release.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_release", {
    p_id: id.data,
    p_name: release.data.name,
    p_description: release.data.description || null,
    p_image_url: release.data.imageUrl || null,
    p_release_date: release.data.releaseDate || null,
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/staff/raffles/${id.data}`);
  revalidatePath("/staff/raffles");
  return { ok: true, message: "Release saved." };
}

export async function updateRaffleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee(["owner", "manager"]);
  const ids = z.object({ releaseId: z.uuid(), raffleId: z.uuid() }).safeParse({
    releaseId: formData.get("releaseId"),
    raffleId: formData.get("raffleId"),
  });
  const raffle = raffleSettingsSchema.safeParse(raffleFormData(formData));
  if (!ids.success) return { error: "That raffle no longer exists." };
  if (!raffle.success) return validationFailed(raffle.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_raffle", {
    p_id: ids.data.raffleId,
    p_scope: raffle.data.scope,
    p_location_id: raffle.data.locationIds[0] ?? null,
    ...setupArgs(raffle.data),
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/staff/raffles/${ids.data.releaseId}`);
  redirect(`/staff/raffles/${ids.data.releaseId}/${ids.data.raffleId}?saved=1`);
}

/** Publish: members can see it, and entries are accepted between its opening and closing times. */
export async function publishRaffleAction(formData: FormData): Promise<void> {
  await requireEmployee(["owner", "manager"]);
  const ids = z.object({ releaseId: z.uuid(), raffleId: z.uuid() }).safeParse({
    releaseId: formData.get("releaseId"),
    raffleId: formData.get("raffleId"),
  });
  if (!ids.success) redirect("/staff/raffles");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("publish_raffle", { p_id: ids.data.raffleId });
  revalidatePath(`/staff/raffles/${ids.data.releaseId}`);
  redirect(
    `/staff/raffles/${ids.data.releaseId}/${ids.data.raffleId}?${error ? `error=${encodeURIComponent(friendlyDbError(error))}` : "published=1"}`,
  );
}

export async function cancelRaffleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee(["owner", "manager"]);
  const releaseId = z.uuid().safeParse(formData.get("releaseId"));
  const parsed = cancelRaffleSchema.safeParse({ raffleId: formData.get("raffleId"), reason: formData.get("reason") });
  if (!releaseId.success) return { error: "That release no longer exists." };
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_raffle", { p_id: parsed.data.raffleId, p_reason: parsed.data.reason });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/staff/raffles/${releaseId.data}`);
  return { ok: true, message: "Raffle cancelled." };
}

/** In store: add a member to this raffle. */
export async function enterMemberAction(formData: FormData): Promise<void> {
  await requireEmployee();
  const ids = z
    .object({ releaseId: z.uuid(), raffleId: z.uuid(), customerId: z.uuid() })
    .safeParse({ releaseId: formData.get("releaseId"), raffleId: formData.get("raffleId"), customerId: formData.get("customerId") });
  if (!ids.success) redirect("/staff/raffles");

  const supabase = await createSupabaseServerClient();
  const choices = formData.getAll("choices").map(String).filter((v) => z.uuid().safeParse(v).success);
  const { error } = await supabase.rpc("staff_enter_raffle", {
    p_raffle_id: ids.data.raffleId,
    p_customer_id: ids.data.customerId,
    p_choices: choices,
  });
  revalidatePath(`/staff/raffles/${ids.data.releaseId}/${ids.data.raffleId}`);
  redirect(
    `/staff/raffles/${ids.data.releaseId}/${ids.data.raffleId}?${error ? `error=${encodeURIComponent(friendlyDbError(error))}` : "entered=1"}`,
  );
}

export async function removeEntryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee();
  const releaseId = z.uuid().safeParse(formData.get("releaseId"));
  const parsed = removeEntrySchema.safeParse({
    entryId: formData.get("entryId"),
    raffleId: formData.get("raffleId"),
    reason: formData.get("reason"),
  });
  if (!releaseId.success) return { error: "That release no longer exists." };
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_raffle_entry", { p_entry_id: parsed.data.entryId, p_reason: parsed.data.reason });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/staff/raffles/${releaseId.data}/${parsed.data.raffleId}`);
  return { ok: true, message: "Entry removed." };
}

/** After the draw: give a person a product by hand, or take it back (no product). */
export async function assignProductAction(formData: FormData): Promise<void> {
  await requireEmployee();
  const parsed = z
    .object({ releaseId: z.uuid(), raffleId: z.uuid(), resultId: z.uuid(), productId: z.union([z.uuid(), z.literal("")]) })
    .safeParse({
      releaseId: formData.get("releaseId"),
      raffleId: formData.get("raffleId"),
      resultId: formData.get("resultId"),
      productId: formData.get("productId") ?? "",
    });
  if (!parsed.success) redirect("/staff/raffles");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("assign_raffle_product", {
    p_result_id: parsed.data.resultId,
    p_product_id: parsed.data.productId || null,
  });
  revalidatePath(`/staff/raffles/${parsed.data.releaseId}/${parsed.data.raffleId}`);
  redirect(
    `/staff/raffles/${parsed.data.releaseId}/${parsed.data.raffleId}?${error ? `error=${encodeURIComponent(friendlyDbError(error))}` : `ok=${encodeURIComponent(parsed.data.productId ? "Product given." : "Product taken back.")}`}`,
  );
}
