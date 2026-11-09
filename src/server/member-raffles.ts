import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStoreNameMap } from "@/server/customers";
import type { EntryChannel, EntryStatus, WinnerOutcome } from "@/types/database";

/** A member's raffle history for their staff profile (§12.2). Staff only see raffles of stores they work with. */
export type MemberRaffle = {
  entryId: string;
  at: string;
  release: string;
  releaseId: string;
  raffleId: string;
  store: string;
  channel: EntryChannel;
  status: EntryStatus;
  outcome: WinnerOutcome | null;
  isWinner: boolean;
};

export async function getMemberRaffles(customerId: string): Promise<MemberRaffle[]> {
  const supabase = await createSupabaseServerClient();
  const { data: entries } = await supabase
    .from("raffle_entries")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(30);
  const rows = entries ?? [];
  if (rows.length === 0) return [];

  const raffleIds = [...new Set(rows.map((e) => e.raffle_id))];
  const [rafflesRes, resultsRes, names] = await Promise.all([
    supabase.from("raffles").select("id, release_id, location_id").in("id", raffleIds),
    supabase.from("raffle_draw_results").select("raffle_id, is_winner, outcome").eq("customer_id", customerId).in("raffle_id", raffleIds),
    getStoreNameMap(),
  ]);
  const raffles = new Map((rafflesRes.data ?? []).map((r) => [r.id, r]));
  const releaseIds = [...new Set((rafflesRes.data ?? []).map((r) => r.release_id))];
  const { data: releases } = releaseIds.length
    ? await supabase.from("raffle_releases").select("id, name").in("id", releaseIds)
    : { data: [] };
  const releaseNames = new Map((releases ?? []).map((r) => [r.id, r.name]));
  const results = new Map((resultsRes.data ?? []).map((r) => [r.raffle_id, r]));

  return rows.map((e) => {
    const raffle = raffles.get(e.raffle_id);
    const result = results.get(e.raffle_id);
    return {
      entryId: e.id,
      at: e.created_at,
      release: raffle ? (releaseNames.get(raffle.release_id) ?? "Release") : "Release",
      releaseId: e.release_id,
      raffleId: e.raffle_id,
      store: raffle?.location_id ? (names.get(raffle.location_id) ?? "Store") : "All stores",
      channel: e.channel,
      status: e.status,
      outcome: result?.is_winner ? result.outcome : null,
      isWinner: Boolean(result?.is_winner),
    };
  });
}
