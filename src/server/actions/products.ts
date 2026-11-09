"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, friendlyDbError, validationFailed } from "@/lib/action-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/server/auth";

const productSchema = z.object({
  name: z.string().trim().min(1, "Give the product a name.").max(120, "Keep the name under 120 characters."),
  description: z.string().trim().max(1000, "Keep the description under 1,000 characters.").default(""),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "Use a web address that starts with https://")
    .default(""),
});

const read = (formData: FormData) => ({
  name: String(formData.get("name") ?? ""),
  description: String(formData.get("description") ?? ""),
  imageUrl: String(formData.get("imageUrl") ?? ""),
});

const duplicate = (error: { code?: string } | null) =>
  error?.code === "23505" ? "A product with that name already exists." : friendlyDbError(error);

export async function createProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee(["owner", "manager"]);
  const parsed = productSchema.safeParse(read(formData));
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_product", {
    p_name: parsed.data.name,
    p_description: parsed.data.description || null,
    p_image_url: parsed.data.imageUrl || null,
  });
  if (error) return { error: duplicate(error) };
  revalidatePath("/staff/products");
  return { ok: true, message: "Product added." };
}

export async function updateProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee(["owner", "manager"]);
  const id = z.uuid().safeParse(formData.get("productId"));
  const parsed = productSchema.safeParse(read(formData));
  if (!id.success) return { error: "That product no longer exists." };
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_product", {
    p_id: id.data,
    p_name: parsed.data.name,
    p_description: parsed.data.description || null,
    p_image_url: parsed.data.imageUrl || null,
    p_is_active: formData.get("isActive") === "on",
  });
  if (error) return { error: duplicate(error) };
  revalidatePath("/staff/products");
  return { ok: true, message: "Saved." };
}

/** Which products a raffle offers (in order). Products can't be taken off once people have entered. */
export async function setRaffleProductsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee(["owner", "manager"]);
  const ids = z
    .object({ releaseId: z.uuid(), raffleId: z.uuid(), productIds: z.array(z.uuid()) })
    .safeParse({ releaseId: formData.get("releaseId"), raffleId: formData.get("raffleId"), productIds: formData.getAll("productIds").map(String) });
  if (!ids.success) return { error: "Something was out of date. Refresh the page and try again." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_raffle_products", { p_raffle_id: ids.data.raffleId, p_product_ids: ids.data.productIds });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/staff/raffles/${ids.data.releaseId}/${ids.data.raffleId}`);
  return { ok: true, message: "Products saved." };
}
