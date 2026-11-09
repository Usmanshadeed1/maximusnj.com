import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DashboardReport,
  RaffleSummaryRow,
  RecentActivityItem,
  TierDistribution,
  TierMovementRow,
  TrendRow,
} from "@/types/database";

/** Every report is a database function that checks who is asking and which stores they may see. */

export async function getDashboardReport(from: string, to: string, storeId: string | null): Promise<DashboardReport> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("report_dashboard", { p_from: from, p_to: to, p_location_id: storeId });
  if (error || !data) throw new Error("Couldn't load the dashboard");
  return data;
}

export async function getRecentActivity(storeId: string | null, limit = 12): Promise<RecentActivityItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("report_recent_activity", { p_location_id: storeId, p_limit: limit });
  return data ?? [];
}

export async function getTierDistribution(storeId: string | null): Promise<TierDistribution> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("report_tier_distribution", { p_location_id: storeId });
  if (error || !data) throw new Error("Couldn't load the tier distribution");
  return data;
}

export async function getTierMovement(storeId: string | null, months = 6): Promise<TierMovementRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("report_tier_movement", { p_months: months, p_location_id: storeId });
  return data ?? [];
}

export async function getTrends(from: string, to: string, storeId: string | null): Promise<TrendRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("report_trends", { p_from: from, p_to: to, p_location_id: storeId });
  return data ?? [];
}

export async function getRaffleSummary(from: string, to: string, storeId: string | null): Promise<RaffleSummaryRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("report_raffle_summary", { p_from: from, p_to: to, p_location_id: storeId });
  return data ?? [];
}
