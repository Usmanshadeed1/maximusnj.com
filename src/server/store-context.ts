import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LocationRow } from "@/types/database";

export const STORE_COOKIE = "mx_store";

/** Active stores the signed-in employee may work at (RLS decides: Owner = all, others = assigned). */
export async function getMyActiveStores(): Promise<LocationRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("locations").select("*").eq("is_active", true).order("name");
  return data ?? [];
}

/**
 * The store chosen on this device, re-checked against the employee's access on every request.
 * Returns null when nothing is chosen or the employee lost access to that store.
 */
export const getSelectedStore = cache(async (): Promise<LocationRow | null> => {
  const storeId = (await cookies()).get(STORE_COOKIE)?.value;
  if (!storeId) return null;
  const stores = await getMyActiveStores();
  return stores.find((s) => s.id === storeId) ?? null;
});
