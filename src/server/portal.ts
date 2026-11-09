import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TierKey } from "@/lib/tier/engine";
import type { NotifyPref, PortalOverviewJson } from "@/types/database";
import { type ProjectionView, toProjectionView, toRuleSetView } from "@/server/tiers";

/** Everything the member pages show. Built from `portal_overview()`, which never includes notes or trades. */
export type PortalData = {
  firstName: string;
  lastName: string;
  memberNumber: string;
  email: string | null;
  mobile: string | null;
  homeStore: string | null;
  memberSince: string;
  active: boolean;
  notifyPrefs: NotifyPref[];
  hasPin: boolean;
  /** First day of the current New York month ("2026-11-01"). */
  month: string;
  tier: {
    key: TierKey;
    label: string;
    source: "override" | "award" | "start";
    /** The month whose activity decided this tier, when it came from the monthly update. */
    decidedFrom: string | null;
    benefits: string | null;
  };
  names: Record<TierKey, string>;
  benefits: Record<TierKey, string | null>;
  projection: ProjectionView;
  visits: { at: string; store: string; counts: boolean }[];
  purchases: { at: string; store: string; type: "purchase" | "refund"; amountCents: number }[];
};

export type MemberAccess =
  | { status: "signed_out" }
  /** Signed in with a verified email that no member record uses → show the sign-up form. */
  | { status: "needs_signup"; email: string }
  /** A shared or unclear email → "Please contact a store". */
  | { status: "contact_store" }
  | { status: "unverified" }
  | { status: "member"; data: PortalData };

function toPortalData(json: PortalOverviewJson): PortalData {
  const rules = toRuleSetView(json.rules);
  const names = rules.names;
  const benefits = Object.fromEntries(rules.tiers.map((t) => [t.key, t.benefits])) as Record<TierKey, string | null>;
  return {
    firstName: json.customer.first_name,
    lastName: json.customer.last_name,
    memberNumber: json.customer.member_number,
    email: json.customer.email,
    mobile: json.customer.mobile_phone,
    homeStore: json.customer.home_store,
    memberSince: json.customer.member_since,
    active: json.customer.status === "active",
    notifyPrefs: json.customer.raffle_notify_prefs,
    hasPin: json.has_pin,
    month: json.month,
    tier: {
      key: json.tier.key,
      label: names[json.tier.key],
      source: json.tier.source,
      decidedFrom: json.tier.qualifying_month,
      benefits: benefits[json.tier.key],
    },
    names,
    benefits,
    projection: toProjectionView(json.projection),
    visits: json.visits,
    purchases: json.purchases.map((p) => ({ at: p.at, store: p.store, type: p.type, amountCents: p.amount_cents })),
  };
}

/**
 * Who is looking at the member pages, and what may they see? Cached per request.
 * A signed-in user with no link gets one automatic linking attempt (§9.2): exactly one active
 * member with their verified email links; a shared email links to nobody.
 * Unlinked, ambiguous or unverified users never receive member data.
 */
export const getMemberAccess = cache(async (): Promise<MemberAccess> => {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { status: "signed_out" };

  const first = await supabase.rpc("portal_overview");
  if (first.error) throw new Error("Couldn't load your account");
  if (first.data) return { status: "member", data: toPortalData(first.data) };

  const link = await supabase.rpc("portal_link_account");
  const state = link.data?.state;
  if (state === "linked") {
    const second = await supabase.rpc("portal_overview");
    if (second.data) return { status: "member", data: toPortalData(second.data) };
    return { status: "contact_store" };
  }
  if (state === "needs_signup") return { status: "needs_signup", email: String(claims.claims.email ?? "") };
  if (state === "unverified") return { status: "unverified" };
  return { status: "contact_store" };
});

/** Active stores a new member can pick as their home store. */
export async function getSignUpStores(): Promise<{ id: string; name: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("portal_locations");
  return data ?? [];
}
