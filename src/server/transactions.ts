import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdjustmentDirection, TransactionType } from "@/types/database";
import { getStoreNameMap } from "./customers";

export type SpendSummary = {
  /** Lifetime net purchase spend (purchases − refunds ± counted adjustments), voided rows ignored. */
  lifetimeCents: number;
  /** Same, for the current New York month. */
  thisMonthCents: number;
  transactionCount: number;
};

export async function getSpend(customerId: string): Promise<SpendSummary> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("customer_spend", { p_customer_id: customerId });
  if (error) throw new Error("Couldn't load spending");
  const row = data?.[0];
  return {
    lifetimeCents: Number(row?.lifetime_net_cents ?? 0),
    thisMonthCents: Number(row?.this_month_net_cents ?? 0),
    transactionCount: Number(row?.transaction_count ?? 0),
  };
}

export type TransactionView = {
  id: string;
  type: TransactionType;
  amountCents: number;
  direction: AdjustmentDirection | null;
  countsTowardTier: boolean;
  occurredAt: string;
  storeName: string;
  employeeName: string | null;
  note: string | null;
  refundOfId: string | null;
  voided: { reason: string } | null;
};

export async function getTransactions(customerId: string, limit = 25): Promise<TransactionView[]> {
  const supabase = await createSupabaseServerClient();
  const [txRes, storeNames, employeesRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .eq("customer_id", customerId)
      .order("occurred_at", { ascending: false })
      .limit(limit),
    getStoreNameMap(),
    // RLS shows employee names only to Owners and Managers; Staff see their own row.
    supabase.from("employees").select("id, first_name, last_name"),
  ]);
  if (txRes.error) throw new Error("Couldn't load transactions");

  const names = new Map((employeesRes.data ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]));
  return (txRes.data ?? []).map((t) => ({
    id: t.id,
    type: t.type,
    amountCents: t.amount_cents,
    direction: t.adjustment_direction,
    countsTowardTier: t.counts_toward_tier,
    occurredAt: t.occurred_at,
    storeName: storeNames.get(t.location_id) ?? "Another store",
    employeeName: t.employee_id ? (names.get(t.employee_id) ?? null) : null,
    note: t.note,
    refundOfId: t.refund_of_transaction_id,
    voided: t.voided_at ? { reason: t.void_reason ?? "" } : null,
  }));
}

export type RefundOption = {
  purchaseId: string;
  totalCents: number;
  remainingCents: number;
  purchaseAt: string;
  storeName: string;
};

/** Purchases that still have something left to refund, for the refund picker. */
export async function getRefundablePurchases(customerId: string): Promise<RefundOption[]> {
  const supabase = await createSupabaseServerClient();
  const [res, storeNames] = await Promise.all([
    supabase.rpc("refundable_purchases", { p_customer_id: customerId }),
    getStoreNameMap(),
  ]);
  if (res.error) throw new Error("Couldn't load purchases");
  return (res.data ?? []).map((p) => ({
    purchaseId: p.purchase_id,
    totalCents: p.total_cents,
    remainingCents: Number(p.remaining_cents),
    purchaseAt: p.purchase_at,
    storeName: storeNames.get(p.store_id) ?? "Another store",
  }));
}
