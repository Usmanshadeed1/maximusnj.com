import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CustomerRow } from "@/types/database";

/** Store id → name for every store the employee can see. */
export async function getStoreNameMap(): Promise<Map<string, string>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("locations").select("id, name");
  return new Map((data ?? []).map((s) => [s.id, s.name]));
}

export async function searchCustomers(query: string): Promise<CustomerRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_customers", { p_query: query, p_limit: 50 });
  if (error) throw new Error("Customer search failed");
  return data ?? [];
}

export async function getRecentCustomers(limit = 20): Promise<CustomerRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .is("merged_into_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Couldn't load customers");
  return data ?? [];
}

export type CustomerDetail = CustomerRow & {
  homeStoreName: string;
  createdByName: string | null;
  mergedInto: { id: string; memberNumber: string; name: string } | null;
};

export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data: customer } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (!customer) return null;

  const [storeRes, creatorRes, mergedRes] = await Promise.all([
    supabase.from("locations").select("name").eq("id", customer.home_location_id).maybeSingle(),
    customer.created_by
      ? supabase.from("employees").select("first_name, last_name").eq("id", customer.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
    customer.merged_into_id
      ? supabase
          .from("customers")
          .select("id, member_number, first_name, last_name")
          .eq("id", customer.merged_into_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    ...customer,
    homeStoreName: storeRes.data?.name ?? "Another store",
    createdByName: creatorRes.data ? `${creatorRes.data.first_name} ${creatorRes.data.last_name}` : null,
    mergedInto: mergedRes.data
      ? {
          id: mergedRes.data.id,
          memberNumber: mergedRes.data.member_number,
          name: `${mergedRes.data.first_name} ${mergedRes.data.last_name}`,
        }
      : null,
  };
}
