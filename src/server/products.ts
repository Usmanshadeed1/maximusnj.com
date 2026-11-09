import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProductRow } from "@/types/database";

/** The product list, newest names first alphabetically. Turned-off products only when asked for. */
export async function getProducts(options: { includeInactive?: boolean } = {}): Promise<ProductRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("products").select("*").order("name");
  if (!options.includeInactive) query = query.eq("is_active", true);
  const { data } = await query;
  return data ?? [];
}

export type RaffleProduct = { id: string; name: string; description: string | null; imageUrl: string | null; position: number };

/** The products one raffle offers, in the order members see them. */
export async function getRaffleProducts(raffleId: string): Promise<RaffleProduct[]> {
  const supabase = await createSupabaseServerClient();
  const { data: links } = await supabase.from("raffle_products").select("*").eq("raffle_id", raffleId).order("position");
  const ids = (links ?? []).map((l) => l.product_id);
  if (ids.length === 0) return [];
  const { data: products } = await supabase.from("products").select("*").in("id", ids);
  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  return (links ?? []).flatMap((l) => {
    const p = byId.get(l.product_id);
    return p ? [{ id: p.id, name: p.name, description: p.description, imageUrl: p.image_url, position: l.position }] : [];
  });
}

/** Entry id → the product names that person picked, in their order. */
export async function getChoicesByEntry(entryIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (entryIds.length === 0) return result;
  const supabase = await createSupabaseServerClient();
  const { data: choices } = await supabase.from("raffle_entry_choices").select("*").in("entry_id", entryIds).order("rank");
  const productIds = [...new Set((choices ?? []).map((c) => c.product_id))];
  const { data: products } = productIds.length ? await supabase.from("products").select("id, name").in("id", productIds) : { data: [] };
  const names = new Map((products ?? []).map((p) => [p.id, p.name]));
  for (const c of choices ?? []) {
    const list = result.get(c.entry_id) ?? [];
    list.push(names.get(c.product_id) ?? "Product");
    result.set(c.entry_id, list);
  }
  return result;
}
