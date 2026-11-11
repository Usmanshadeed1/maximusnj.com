import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type GiftCardListItem = {
  id: string;
  code: string;
  balanceCents: number;
  active: boolean;
  holderName: string | null;
  holderNumber: string | null;
  createdAt: string;
};

export type GiftCardEntryView = {
  id: string;
  kind: "sold" | "added" | "spent" | "fixed" | "turned_off" | "turned_on";
  amountCents: number;
  balanceAfterCents: number;
  storeName: string | null;
  staffName: string | null;
  paidBy: string | null;
  note: string | null;
  createdAt: string;
};

export type GiftCardDetail = GiftCardListItem & { holderId: string | null; entries: GiftCardEntryView[] };

type CardRow = {
  id: string;
  code: string;
  balance_cents: number;
  is_active: boolean;
  created_at: string;
  customer_id: string | null;
  customer: { first_name: string; last_name: string; member_number: string } | null;
};

const CARD_SELECT = "id, code, balance_cents, is_active, created_at, customer_id, customer:customers!gift_cards_customer_id_fkey(first_name, last_name, member_number)";

function toItem(r: CardRow): GiftCardListItem {
  return {
    id: r.id,
    code: r.code,
    balanceCents: r.balance_cents,
    active: r.is_active,
    holderName: r.customer ? `${r.customer.first_name} ${r.customer.last_name}` : null,
    holderNumber: r.customer?.member_number ?? null,
    createdAt: r.created_at,
  };
}

/** Newest first; with a search, matches the card number or the holder (name, phone, email or member number). */
export async function getGiftCards(q: string): Promise<GiftCardListItem[]> {
  const supabase = await createSupabaseServerClient();
  const text = q.trim().replace(/[%_,()]/g, "");
  if (!text) {
    const { data } = await supabase.from("gift_cards").select(CARD_SELECT).order("created_at", { ascending: false }).limit(50);
    return ((data ?? []) as unknown as CardRow[]).map(toItem);
  }

  const { data: people } = await supabase.rpc("search_customers", { p_query: q.trim().slice(0, 100), p_limit: 50 });
  const ids = (people ?? []).map((p) => p.id);
  const filter = ids.length ? `code.ilike.%${text}%,customer_id.in.(${ids.join(",")})` : `code.ilike.%${text}%`;
  const { data } = await supabase.from("gift_cards").select(CARD_SELECT).or(filter).order("created_at", { ascending: false }).limit(50);
  return ((data ?? []) as unknown as CardRow[]).map(toItem);
}

/** Gift cards connected to one member (for their profile). */
export async function getMemberGiftCards(customerId: string): Promise<GiftCardListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("gift_cards").select(CARD_SELECT).eq("customer_id", customerId).order("created_at");
  return ((data ?? []) as unknown as CardRow[]).map(toItem);
}

export async function getGiftCard(id: string): Promise<GiftCardDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("gift_cards").select(CARD_SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const card = data as unknown as CardRow;

  const { data: rows } = await supabase
    .from("gift_card_entries")
    .select(
      "id, kind, amount_cents, balance_after_cents, note, created_at, location:locations(name), employee:employees(first_name, last_name), payer:customers!gift_card_entries_paid_by_customer_id_fkey(first_name, last_name, member_number)",
    )
    .eq("gift_card_id", id)
    .order("created_at", { ascending: false });

  type EntryRow = {
    id: string;
    kind: GiftCardEntryView["kind"];
    amount_cents: number;
    balance_after_cents: number;
    note: string | null;
    created_at: string;
    location: { name: string } | null;
    employee: { first_name: string; last_name: string } | null;
    payer: { first_name: string; last_name: string; member_number: string } | null;
  };

  return {
    ...toItem(card),
    holderId: card.customer_id,
    entries: ((rows ?? []) as unknown as EntryRow[]).map((e) => ({
      id: e.id,
      kind: e.kind,
      amountCents: e.amount_cents,
      balanceAfterCents: e.balance_after_cents,
      storeName: e.location?.name ?? null,
      staffName: e.employee ? `${e.employee.first_name} ${e.employee.last_name}` : null,
      paidBy: e.payer ? `${e.payer.first_name} ${e.payer.last_name} (${e.payer.member_number})` : null,
      note: e.note,
      createdAt: e.created_at,
    })),
  };
}
