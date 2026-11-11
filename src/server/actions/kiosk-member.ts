"use server";

import type { MemberGiftCard } from "@/types/database";
import { z } from "zod";
import type { ActionState } from "@/lib/action-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TierKey } from "@/lib/tier/engine";
import { getKioskStore } from "@/server/kiosk-context";
import type { PortalRaffle } from "@/server/portal";
import { type ProjectionView, toProjectionView, toRuleSetView } from "@/server/tiers";

/** The member's page on the kiosk: what they may see on a shared screen in the store. */
export type KioskMemberView = {
  firstName: string;
  lastName: string;
  memberNumber: string;
  month: string;
  tier: TierKey;
  tierLabel: string;
  benefits: string | null;
  names: Record<TierKey, string>;
  projection: ProjectionView;
  raffles: PortalRaffle[];
  giftCards: MemberGiftCard[];
};

const MESSAGES: Record<string, string> = {
  raffle_not_open: "This raffle isn't open for entries right now.",
  already_entered: "You're already entered in this raffle.",
  entered_other_raffle: "You've already entered another store's raffle for this release. You can only enter one.",
  entry_removed: "Please ask a team member about your entry.",
  customer_inactive: "Your membership is paused. Please ask a team member.",
  not_active: "You don't have an entry in this raffle.",
  choices_required: "Pick at least one product.",
  choices_duplicate: "Each product can only be picked once.",
  choice_invalid: "One of those products is no longer offered.",
  pass_expired: "Your time on this screen ran out. Please check in again.",
};

/** Loads the page for the member who just checked in on this kiosk (the pass lasts 15 minutes). */
export async function kioskMemberViewAction(pass: string): Promise<KioskMemberView | null> {
  const store = await getKioskStore();
  if (!store || typeof pass !== "string" || pass.length > 100) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("kiosk_member_view", { p_token: pass, p_location_id: store.id });
  if (error || !data) return null;

  const rules = toRuleSetView(data.rules);
  const benefits = Object.fromEntries(rules.tiers.map((t) => [t.key, t.benefits])) as Record<TierKey, string | null>;
  return {
    firstName: data.first_name,
    lastName: data.last_name,
    memberNumber: data.member_number,
    month: data.month,
    tier: data.tier,
    tierLabel: rules.names[data.tier],
    benefits: benefits[data.tier],
    names: rules.names,
    projection: toProjectionView(data.projection),
    giftCards: data.gift_cards ?? [],
    raffles: (data.raffles ?? []).map((r) => ({
      id: r.raffle_id,
      name: r.release.name,
      description: r.release.description,
      imageUrl: r.release.image_url,
      releaseDate: r.release.release_date,
      scope: r.scope,
      store: r.store,
      pickup: r.pickup,
      pickupRule: r.pickup_rule,
      winners: r.winners,
      opensAt: r.opens_at,
      closesAt: r.closes_at,
      phase: r.phase,
      entered: r.entered,
      enteredOther: r.entered_other,
      removed: r.removed,
      products: r.products ?? [],
      myChoices: r.my_choices ?? [],
      result: r.result,
    })),
  };
}

const ids = z.object({ pass: z.string().min(10).max(100), raffleId: z.uuid() });

export async function kioskMemberEnterAction(pass: string, raffleId: string, choices: string[] = []): Promise<ActionState> {
  const store = await getKioskStore();
  const parsed = ids.safeParse({ pass, raffleId });
  if (!store || !parsed.success) return { error: MESSAGES.pass_expired };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("kiosk_member_enter_raffle", {
    p_token: parsed.data.pass,
    p_location_id: store.id,
    p_raffle_id: parsed.data.raffleId,
    p_choices: (Array.isArray(choices) ? choices : []).filter((c) => z.uuid().safeParse(c).success).slice(0, 50),
  });
  if (error) return { error: MESSAGES[error.message] ?? "Something went wrong. Please try again." };
  return { ok: true, message: "You're in! Good luck." };
}

export async function kioskMemberWithdrawAction(pass: string, raffleId: string): Promise<ActionState> {
  const store = await getKioskStore();
  const parsed = ids.safeParse({ pass, raffleId });
  if (!store || !parsed.success) return { error: MESSAGES.pass_expired };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("kiosk_member_withdraw", { p_token: parsed.data.pass, p_location_id: store.id, p_raffle_id: parsed.data.raffleId });
  if (error) return { error: MESSAGES[error.message] ?? "Something went wrong. Please try again." };
  return { ok: true, message: "Your entry was withdrawn." };
}
