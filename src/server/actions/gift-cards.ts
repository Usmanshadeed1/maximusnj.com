"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, friendlyDbError } from "@/lib/action-result";
import { parseMoneyToCents } from "@/lib/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/server/auth";
import { getSelectedStore } from "@/server/store-context";

const NO_STORE = "Choose the store you're working at first (top of the page).";

function money(formData: FormData, field: string, allowZero = false): { cents: number } | { error: ActionState } {
  const parsed = parseMoneyToCents(String(formData.get(field) ?? ""), { allowZero });
  if (!parsed.ok) return { error: { error: "Please fix the highlighted fields.", fieldErrors: { [field]: [parsed.error] } } };
  return { cents: parsed.cents };
}

const text = (formData: FormData, field: string, max: number) => String(formData.get(field) ?? "").trim().slice(0, max);
const cardId = (formData: FormData) => z.uuid().safeParse(formData.get("cardId"));

function done(id: string, message: string): ActionState {
  revalidatePath(`/staff/gift-cards/${id}`);
  revalidatePath("/staff/gift-cards");
  return { ok: true, message };
}

/** Sell a new gift card. Opens the card afterwards. */
export async function sellGiftCardAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee();
  const store = await getSelectedStore();
  if (!store) return { error: NO_STORE };
  const amount = money(formData, "amount");
  if ("error" in amount) return amount.error;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("gift_card_sell", {
    p_code: text(formData, "code", 40) || null,
    p_amount_cents: amount.cents,
    p_location_id: store.id,
    p_paid_by_member: text(formData, "paidBy", 20) || null,
    p_holder_member: text(formData, "holder", 20) || null,
    p_note: text(formData, "note", 300) || null,
  });
  if (error || !data) return { error: friendlyDbError(error) };
  revalidatePath("/staff/gift-cards");
  redirect(`/staff/gift-cards/${data.id}?sold=1`);
}

export async function addToGiftCardAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee();
  const store = await getSelectedStore();
  if (!store) return { error: NO_STORE };
  const id = cardId(formData);
  if (!id.success) return { error: "That gift card no longer exists." };
  const amount = money(formData, "amount");
  if ("error" in amount) return amount.error;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("gift_card_add", {
    p_card_id: id.data,
    p_amount_cents: amount.cents,
    p_location_id: store.id,
    p_paid_by_member: text(formData, "paidBy", 20) || null,
    p_note: text(formData, "note", 300) || null,
  });
  if (error) return { error: friendlyDbError(error) };
  return done(id.data, "Money added.");
}

export async function spendGiftCardAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee();
  const store = await getSelectedStore();
  if (!store) return { error: NO_STORE };
  const id = cardId(formData);
  if (!id.success) return { error: "That gift card no longer exists." };
  const amount = money(formData, "amount");
  if ("error" in amount) return amount.error;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("gift_card_spend", {
    p_card_id: id.data,
    p_amount_cents: amount.cents,
    p_location_id: store.id,
    p_note: text(formData, "note", 300) || null,
  });
  if (error) return { error: friendlyDbError(error) };
  return done(id.data, "Spending recorded.");
}

export async function fixGiftCardAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee();
  const store = await getSelectedStore();
  if (!store) return { error: NO_STORE };
  const id = cardId(formData);
  if (!id.success) return { error: "That gift card no longer exists." };
  const amount = money(formData, "balance", true);
  if ("error" in amount) return amount.error;
  const reason = text(formData, "reason", 300);
  if (!reason) return { error: "Please fix the highlighted fields.", fieldErrors: { reason: ["Please give a reason."] } };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("gift_card_fix", {
    p_card_id: id.data,
    p_new_balance_cents: amount.cents,
    p_location_id: store.id,
    p_reason: reason,
  });
  if (error) return { error: error.message === "no_changes" ? "That is already the balance." : friendlyDbError(error) };
  return done(id.data, "Balance fixed.");
}

export async function setGiftCardActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee();
  const store = await getSelectedStore();
  if (!store) return { error: NO_STORE };
  const id = cardId(formData);
  if (!id.success) return { error: "That gift card no longer exists." };
  const active = formData.get("active") === "true";

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("gift_card_set_active", {
    p_card_id: id.data,
    p_active: active,
    p_location_id: store.id,
    p_reason: text(formData, "reason", 300) || null,
  });
  if (error) return { error: error.message === "no_changes" ? (active ? "The card is already on." : "The card is already off.") : friendlyDbError(error) };
  return done(id.data, active ? "Card turned on." : "Card turned off.");
}

export async function setGiftCardMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee();
  const id = cardId(formData);
  if (!id.success) return { error: "That gift card no longer exists." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("gift_card_set_member", { p_card_id: id.data, p_member_number: text(formData, "holder", 20) });
  if (error) return { error: friendlyDbError(error) };
  return done(id.data, text(formData, "holder", 20) ? "Connected to the member." : "No longer connected to a member.");
}
