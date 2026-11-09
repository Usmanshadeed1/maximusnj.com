import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PortalStatusJson } from "@/types/database";

/** Whether a member has an online login and a PIN (never the PIN itself). Staff only. */
export async function getPortalStatus(customerId: string): Promise<PortalStatusJson | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("customer_portal_status", { p_customer_id: customerId });
  return error ? null : data;
}
