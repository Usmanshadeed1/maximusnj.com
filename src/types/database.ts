/**
 * Database types for the Supabase client.
 * Hand-written for Step 1. Once the project is linked, regenerate with:
 *   npx supabase gen types typescript --db-url "$SUPABASE_DB_URL" --schema public > src/types/database.ts
 */

export type EmployeeRole = "owner" | "manager" | "staff";

import type { LookbackMethod, TierKey } from "@/lib/tier/engine";

export type { LookbackMethod, TierKey };

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type LocationRow = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  timezone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type EmployeeRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: EmployeeRole;
  is_active: boolean;
  invited_by: string | null;
  /** The member card linked to this employee (for the kiosk). */
  customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export type EmployeeLocationRow = {
  employee_id: string;
  location_id: string;
  created_at: string;
}

export type AuditLogRow = {
  id: number;
  actor_type: "employee" | "customer" | "system";
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Json | null;
  after: Json | null;
  reason: string | null;
  created_at: string;
}

export type AppSettingRow = {
  key: string;
  value: Json;
  updated_by: string | null;
  updated_at: string;
}

export type CustomerStatus = "active" | "inactive";
export type CustomerSource = "staff" | "online" | "migration";

export type CustomerRow = {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  mobile_phone: string | null;
  no_mobile: boolean;
  email: string | null;
  email_verified_at: string | null;
  mobile_verified_at: string | null;
  home_location_id: string;
  status: CustomerStatus;
  is_under_13: boolean;
  age_13_confirmed: boolean;
  created_via: CustomerSource;
  created_by: string | null;
  merged_into_id: string | null;
  raffle_notify_prefs: string[];
  anonymized_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DuplicateMatch = {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  mobile_phone: string | null;
  email: string | null;
  status: CustomerStatus;
  match_reasons: ("phone" | "email" | "name")[];
};

export type TransactionType = "purchase" | "refund" | "trade_buyin" | "membership_payment" | "adjustment";
export type AdjustmentDirection = "credit" | "debit";

export type TransactionRow = {
  id: string;
  customer_id: string;
  location_id: string;
  employee_id: string | null;
  type: TransactionType;
  amount_cents: number;
  adjustment_direction: AdjustmentDirection | null;
  counts_toward_tier: boolean;
  refund_of_transaction_id: string | null;
  occurred_at: string;
  local_month: string;
  note: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
};

export type CustomerSpend = {
  lifetime_net_cents: number;
  this_month_net_cents: number;
  transaction_count: number;
};

export type RefundablePurchase = {
  purchase_id: string;
  total_cents: number;
  remaining_cents: number;
  purchase_at: string;
  store_id: string;
};

export type TierOverrideRow = {
  id: string;
  customer_id: string;
  tier_key: TierKey;
  reason: string;
  last_month: string | null;
  created_by: string | null;
  created_at: string;
  removed_at: string | null;
  removed_by: string | null;
  removal_reason: string | null;
};

export type TierRuleSetRow = {
  id: string;
  version: number;
  effective_from_month: string;
  visit_value_cents: number;
  lookback_months: number;
  lookback_method: LookbackMethod;
  carry_over_enabled: boolean;
  require_purchase: boolean;
  require_visit: boolean;
  created_by: string | null;
  created_at: string;
};

export type TierThresholdRow = {
  rule_set_id: string;
  tier_key: TierKey;
  rank: number;
  display_name: string;
  threshold_cents: number;
  benefits_text: string | null;
};

/** A rule set with its four tiers, as returned by the database functions. */
export type TierRuleSetJson = Omit<TierRuleSetRow, never> & {
  tiers: { tier_key: TierKey; rank: number; display_name: string; threshold_cents: number; benefits_text: string | null }[];
};

export type TierRulesOverview = {
  month: string;
  next_month: string;
  current: TierRuleSetJson;
  next: TierRuleSetJson;
  history: TierRuleSetJson[];
};

export type AwardSource = "scheduled" | "manual" | "test" | "recalculation";

export type MonthlyTierAwardRow = {
  id: string;
  customer_id: string;
  qualifying_month: string;
  awarded_month: string;
  tier_key: TierKey;
  rule_set_id: string;
  net_spend_cents: number;
  qualifying_visits: number;
  visit_points_cents: number;
  score_cents: number;
  carry_in_cents: number;
  carry_out_cents: number;
  requirements_met: boolean;
  evidence: {
    months: { month: string; spend_cents: number; visits: number }[];
    lookback_months: number;
    method: LookbackMethod;
    carry_over: boolean;
    visit_value_cents: number;
  };
  calc_version: number;
  run_id: string | null;
  source: AwardSource;
  is_test: boolean;
  is_current: boolean;
  superseded_by: string | null;
  reason: string | null;
  calculated_by: string | null;
  calculated_at: string;
};

export type RolloverRunRow = {
  id: string;
  awarded_month: string;
  source: "scheduled" | "manual" | "test";
  status: "running" | "succeeded" | "failed";
  customers_processed: number;
  customers_skipped: number;
  summary: Partial<Record<TierKey, number>> | null;
  error: string | null;
  started_by: string | null;
  started_at: string;
  finished_at: string | null;
};

export type RolloverResult = {
  status: "succeeded" | "failed" | "already_running";
  run_id?: string;
  awarded_month: string;
  processed?: number;
  skipped?: number;
  summary?: Partial<Record<TierKey, number>> | null;
  error?: string | null;
};

export type RecalculateResult = { awarded_month: string; members: number; changed: number; unchanged: number };

export type TierProjectionJson = {
  month: string;
  next_month: string;
  months: { month: string; spend_cents: number; visits: number }[];
  carry_in_cents: number;
  rules: TierRuleSetJson;
  projected: { tier_key: TierKey; score_cents: number; carry_out_cents: number };
};

export type VisitStatus = "counted" | "duplicate";

export type VisitRow = {
  id: string;
  customer_id: string;
  location_id: string;
  employee_id: string | null;
  device_id: string | null;
  checked_in_at: string;
  local_date: string;
  status: VisitStatus;
  is_qualifying: boolean;
  created_at: string;
};

/** What check_in returns — only what the kiosk is allowed to show. */
export type CheckInResult =
  | { result: "checked_in"; first_name: string; tier: string; qualifying: boolean; view_pass?: string }
  | { result: "already_checked_in"; first_name: string; tier: string; view_pass?: string }
  | { result: "not_found" }
  | { result: "inactive" }
  | { result: "pin_required" }
  | { result: "pin_incorrect"; attempts_left: number }
  | { result: "pin_locked"; minutes_left: number }
  | { result: "pin_not_found"; attempts_left: number }
  | { result: "kiosk_locked"; minutes_left: number }
  | { result: "staff_choice"; first_name: string; role: EmployeeRole; token: string };

// ---- Customer portal (Step 7) -------------------------------------------------------------------
export type LinkState = "linked" | "unverified" | "needs_signup" | "contact_store";
export type NotifyPref = "email" | "portal" | "phone";

/** What the portal is allowed to know about the signed-in member (no notes, trades or employee names). */
export type PortalOverviewJson = {
  customer: {
    member_number: string;
    first_name: string;
    last_name: string;
    email: string | null;
    mobile_phone: string | null;
    status: CustomerStatus;
    home_store: string | null;
    member_since: string;
    raffle_notify_prefs: NotifyPref[];
  };
  has_pin: boolean;
  month: string;
  tier: { key: TierKey; source: "override" | "award" | "start"; qualifying_month: string | null };
  rules: Omit<TierRuleSetJson, "created_by">;
  projection: Omit<TierProjectionJson, "rules"> & { rules: Omit<TierRuleSetJson, "created_by"> };
  visits: { at: string; store: string; counts: boolean }[];
  purchases: { at: string; store: string; type: "purchase" | "refund"; amount_cents: number }[];
};

export type PortalStatusJson = {
  linked: boolean;
  linked_at: string | null;
  linked_via: "auto" | "online_signup" | "staff" | null;
  has_pin: boolean;
  pin_locked_until: string | null;
};

// ---- Reports (Step 10) ------------------------------------------------------------------------------
export type DashboardReport = {
  /** False for Staff: they get no money figures. */
  money: boolean;
  customers_total: number;
  customers_new: number;
  visits: number;
  visitors: number;
  transactions: number | null;
  net_cents: number | null;
  series: { day: string; visits: number; net_cents: number | null }[];
};

export type RecentActivityItem = {
  kind: "visit" | "purchase" | "refund";
  at: string;
  customer_id: string;
  name: string;
  store: string;
  amount_cents: number | null;
};

export type TierDistribution = { base: number; silver: number; gold: number; diamond: number; total: number };

export type TierMovementRow = {
  month: string;
  base: number;
  silver: number;
  gold: number;
  diamond: number;
  qualified: number;
  upgrades: number;
  downgrades: number;
};

export type TrendRow = {
  month: string;
  location_id: string;
  store: string;
  visits: number;
  net_cents: number;
  transactions: number;
  new_members: number;
};

export type RaffleSummaryRow = {
  raffle_id: string;
  release_id: string;
  release: string;
  store: string;
  scope: RaffleScope;
  status: RaffleStatus;
  closes_at: string;
  winner_count: number;
  entries: number;
  online: number;
  in_store: number;
  claimed: number;
  expired: number;
  declined: number;
  waiting: number;
  sales_cents: number;
};

// ---- Raffles (Step 8) -----------------------------------------------------------------------------
export type RaffleStatus = "draft" | "open" | "closed" | "drawn" | "completed" | "cancelled";
export type RaffleScope = "store" | "company";
export type RafflePickupRule = "raffle_store" | "home_store" | "specific_store";
export type EntryChannel = "online" | "in_store";
export type EntryStatus = "active" | "withdrawn" | "removed";
export type RaffleChannel = "email" | "portal";

export type RaffleReleaseRow = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  release_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RaffleRow = {
  id: string;
  release_id: string;
  scope: RaffleScope;
  location_id: string | null;
  pickup_rule: RafflePickupRule;
  pickup_location_id: string | null;
  winner_count: number;
  opens_at: string;
  closes_at: string;
  claim_deadline_hours: number;
  allowed_channels: RaffleChannel[];
  status: RaffleStatus;
  cancelled_reason: string | null;
  drawn_at: string | null;
  drawn_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RaffleEntryRow = {
  id: string;
  raffle_id: string;
  release_id: string;
  customer_id: string;
  channel: EntryChannel;
  entered_by_employee_id: string | null;
  status: EntryStatus;
  removed_reason: string | null;
  removed_by: string | null;
  created_at: string;
  ended_at: string | null;
};

export type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RaffleProductRow = { raffle_id: string; product_id: string; position: number };
export type RaffleEntryChoiceRow = { entry_id: string; rank: number; product_id: string };

export type PortalProduct = { id: string; name: string; description: string | null; image_url: string | null };

export type WinnerOutcome = "pending" | "notified" | "claimed" | "expired" | "declined";

export type RaffleDrawResultRow = {
  id: string;
  raffle_id: string;
  position: number;
  entry_id: string;
  customer_id: string;
  is_winner: boolean;
  outcome: WinnerOutcome;
  notify_state: "notified" | "call_manually" | null;
  notified_at: string | null;
  notified_via: string | null;
  claim_deadline_at: string | null;
  claimed_at: string | null;
  transaction_id: string | null;
  handled_by: string | null;
  handled_note: string | null;
  assigned_product_id: string | null;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  customer_id: string;
  channel: "email" | "portal";
  template: "raffle_win";
  related_type: string;
  related_id: string;
  status: "queued" | "sent" | "failed";
  attempts: number;
  sent_at: string | null;
  error: string | null;
  created_at: string;
};

export type EmailQueueRow = {
  notification_id: string;
  email: string;
  first_name: string;
  release_name: string;
  pickup_name: string | null;
  deadline_at: string | null;
  claim_hours: number;
  attempts: number;
};

/** A member's own result in a drawn raffle. Never a position, never anyone else's. */
export type PortalRaffleResult =
  | { state: "waiting" }
  | { state: "won"; deadline_at: string | null; product: string | null }
  | { state: "collected"; product: string | null }
  | { state: "expired" }
  | { state: "declined" }
  | { state: "not_selected" };

/** What the member page gets for one raffle. Never any counts or other entrants. */
export type PortalRaffleJson = {
  raffle_id: string;
  release: { name: string; description: string | null; image_url: string | null; release_date: string | null };
  scope: RaffleScope;
  store: string | null;
  pickup: string | null;
  pickup_rule: RafflePickupRule;
  winners: number;
  opens_at: string;
  closes_at: string;
  phase: "upcoming" | "open" | "closed" | "drawn" | "completed" | "cancelled" | "draft";
  entered: boolean;
  entered_other: boolean;
  removed: boolean;
  products: PortalProduct[];
  my_choices: string[];
  result: PortalRaffleResult | null;
};

/** What the kiosk may show a member who just checked in: no email, phone or purchases. */
export type KioskMemberViewJson = {
  first_name: string;
  last_name: string;
  member_number: string;
  month: string;
  tier: TierKey;
  rules: Omit<TierRuleSetJson, "created_by">;
  projection: Omit<TierProjectionJson, "rules"> & { rules: Omit<TierRuleSetJson, "created_by"> };
  raffles: PortalRaffleJson[] | null;
};

type RaffleSetupArgs = {
  p_pickup_rule: RafflePickupRule;
  p_pickup_location_id: string | null;
  p_winner_count: number;
  p_opens_at: string;
  p_closes_at: string;
  p_claim_hours: number;
  p_channels: RaffleChannel[];
};

type CustomerFields = {
  p_first_name: string;
  p_last_name: string;
  p_mobile: string | null;
  p_no_mobile: boolean;
  p_email: string | null;
  p_home_location_id: string;
  p_is_under_13: boolean;
};

type ReadOnlyTable<Row> = {
  Row: Row;
  Insert: Record<string, never>;
  Update: Record<string, never>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      locations: ReadOnlyTable<LocationRow>;
      employees: ReadOnlyTable<EmployeeRow>;
      employee_locations: ReadOnlyTable<EmployeeLocationRow>;
      audit_logs: ReadOnlyTable<AuditLogRow>;
      app_settings: ReadOnlyTable<AppSettingRow>;
      customers: ReadOnlyTable<CustomerRow>;
      visits: ReadOnlyTable<VisitRow>;
      transactions: ReadOnlyTable<TransactionRow>;
      tier_rule_sets: ReadOnlyTable<TierRuleSetRow>;
      tier_thresholds: ReadOnlyTable<TierThresholdRow>;
      tier_overrides: ReadOnlyTable<TierOverrideRow>;
      monthly_tier_awards: ReadOnlyTable<MonthlyTierAwardRow>;
      tier_rollover_runs: ReadOnlyTable<RolloverRunRow>;
      raffle_releases: ReadOnlyTable<RaffleReleaseRow>;
      raffles: ReadOnlyTable<RaffleRow>;
      raffle_entries: ReadOnlyTable<RaffleEntryRow>;
      raffle_draw_results: ReadOnlyTable<RaffleDrawResultRow>;
      notifications: ReadOnlyTable<NotificationRow>;
      products: ReadOnlyTable<ProductRow>;
      raffle_products: ReadOnlyTable<RaffleProductRow>;
      raffle_entry_choices: ReadOnlyTable<RaffleEntryChoiceRow>;
    };
    Views: { [_ in never]: never };
    Functions: {
      create_location: {
        Args: { p_name: string; p_code: string; p_address?: string | null };
        Returns: LocationRow;
      };
      update_location: {
        Args: {
          p_id: string;
          p_name: string;
          p_code: string;
          p_address: string | null;
          p_is_active: boolean;
        };
        Returns: LocationRow;
      };
      delete_location: {
        Args: { p_id: string; p_confirm_name: string };
        Returns: undefined;
      };
      create_employee_record: {
        Args: {
          p_user_id: string;
          p_first_name: string;
          p_last_name: string;
          p_email: string;
          p_role: EmployeeRole;
          p_location_ids: string[];
          p_created_with_password?: boolean;
        };
        Returns: EmployeeRow;
      };
      set_employee_role: {
        Args: { p_employee_id: string; p_role: EmployeeRole };
        Returns: EmployeeRow;
      };
      set_employee_active: {
        Args: { p_employee_id: string; p_is_active: boolean };
        Returns: EmployeeRow;
      };
      set_employee_locations: {
        Args: { p_employee_id: string; p_location_ids: string[] };
        Returns: undefined;
      };
      search_customers: {
        Args: { p_query: string; p_limit?: number };
        Returns: CustomerRow[];
      };
      find_customer_duplicates: {
        Args: {
          p_mobile: string | null;
          p_email: string | null;
          p_first_name: string;
          p_last_name: string;
          p_exclude_id?: string | null;
        };
        Returns: DuplicateMatch[];
      };
      register_customer: {
        Args: CustomerFields;
        Returns: CustomerRow;
      };
      update_customer: {
        Args: CustomerFields & { p_id: string };
        Returns: CustomerRow;
      };
      set_customer_status: {
        Args: { p_id: string; p_status: CustomerStatus; p_reason?: string | null };
        Returns: CustomerRow;
      };
      merge_customers: {
        Args: { p_source_id: string; p_target_id: string; p_reason: string };
        Returns: CustomerRow;
      };
      run_month_rollover_now: {
        Args: Record<string, never>;
        Returns: RolloverResult;
      };
      run_test_rollover: {
        Args: { p_awarded_month: string };
        Returns: RolloverResult;
      };
      recalculate_awards: {
        Args: { p_awarded_month: string; p_reason: string; p_customer_id?: string | null };
        Returns: RecalculateResult;
      };
      tier_rules_overview: {
        Args: Record<string, never>;
        Returns: TierRulesOverview;
      };
      tier_projection: {
        Args: { p_customer_id: string };
        Returns: TierProjectionJson;
      };
      customer_tier_override: {
        Args: { p_customer_id: string };
        Returns: TierOverrideRow[];
      };
      save_tier_rules: {
        Args: {
          p_visit_value_cents: number;
          p_lookback_months: number;
          p_lookback_method: LookbackMethod;
          p_carry_over: boolean;
          p_require_purchase: boolean;
          p_require_visit: boolean;
          p_tiers: { tier_key: TierKey; display_name: string; threshold_cents: number; benefits_text: string | null }[];
        };
        Returns: TierRuleSetJson;
      };
      set_tier_override: {
        Args: { p_customer_id: string; p_tier: TierKey; p_reason: string; p_last_month?: string | null };
        Returns: TierOverrideRow;
      };
      clear_tier_override: {
        Args: { p_customer_id: string; p_reason: string };
        Returns: TierOverrideRow;
      };
      record_transaction: {
        Args: {
          p_customer_id: string;
          p_location_id: string;
          p_type: TransactionType;
          p_amount_cents: number;
          p_occurred_at?: string | null;
          p_note?: string | null;
          p_refund_of?: string | null;
          p_adjustment_direction?: AdjustmentDirection | null;
          p_counts_toward_tier?: boolean;
        };
        Returns: TransactionRow;
      };
      void_transaction: {
        Args: { p_id: string; p_reason: string };
        Returns: TransactionRow;
      };
      customer_spend: {
        Args: { p_customer_id: string };
        Returns: CustomerSpend[];
      };
      refundable_purchases: {
        Args: { p_customer_id: string };
        Returns: RefundablePurchase[];
      };
      check_in: {
        Args: { p_member_number: string; p_location_id: string; p_device_id?: string | null; p_pin?: string | null };
        Returns: CheckInResult;
      };
      check_in_by_pin: {
        Args: { p_pin: string; p_location_id: string; p_device_id?: string | null };
        Returns: CheckInResult;
      };
      kiosk_staff_check_in: { Args: { p_token: string; p_location_id: string; p_device_id?: string | null }; Returns: CheckInResult };
      kiosk_staff_sign_in: { Args: { p_token: string; p_location_id: string }; Returns: string };
      staff_set_my_pin: { Args: { p_pin: string }; Returns: boolean };
      staff_my_card: { Args: Record<string, never>; Returns: { member_number: string; has_pin: boolean } | null };
      link_employee_card: { Args: { p_employee_id: string; p_member_number: string }; Returns: string };
      create_employee_card: { Args: { p_employee_id: string; p_location_id: string }; Returns: string };
      unlink_employee_card: { Args: { p_employee_id: string }; Returns: boolean };
      kiosk_member_view: { Args: { p_token: string; p_location_id: string }; Returns: KioskMemberViewJson };
      kiosk_member_enter_raffle: { Args: { p_token: string; p_location_id: string; p_raffle_id: string; p_choices?: string[] }; Returns: boolean };
      kiosk_member_withdraw: { Args: { p_token: string; p_location_id: string; p_raffle_id: string }; Returns: boolean };
      staff_set_customer_pin: { Args: { p_customer_id: string; p_pin: string }; Returns: boolean };
      web_pin_sign_in: { Args: { p_pin: string; p_client_key: string; p_member_number?: string | null }; Returns: WebPinSignInResult };
      web_pin_link: { Args: { p_customer_id: string; p_user_id: string }; Returns: boolean };
      portal_link_account: { Args: Record<string, never>; Returns: { state: LinkState } };
      portal_locations: { Args: Record<string, never>; Returns: { id: string; name: string }[] };
      portal_sign_up: {
        Args: { p_first_name: string; p_last_name: string; p_mobile: string; p_home_location_id: string; p_age_13: boolean };
        Returns: { state: "linked"; member_number?: string };
      };
      portal_overview: { Args: Record<string, never>; Returns: PortalOverviewJson | null };
      portal_set_notify_prefs: { Args: { p_prefs: string[] }; Returns: string[] };
      portal_set_pin: { Args: { p_pin: string }; Returns: boolean };
      customer_portal_status: { Args: { p_customer_id: string }; Returns: PortalStatusJson };
      reset_customer_pin: { Args: { p_customer_id: string; p_reason?: string | null }; Returns: boolean };
      link_customer_login: { Args: { p_customer_id: string }; Returns: boolean };
      unlink_customer_login: { Args: { p_customer_id: string; p_reason: string }; Returns: boolean };
      create_release_with_raffles: {
        Args: RaffleSetupArgs & {
          p_name: string;
          p_description: string | null;
          p_image_url: string | null;
          p_release_date: string | null;
          p_scope: RaffleScope;
          p_location_ids: string[];
        };
        Returns: { release_id: string; raffle_ids: string[] };
      };
      add_raffles_to_release: {
        Args: RaffleSetupArgs & { p_release_id: string; p_scope: RaffleScope; p_location_ids: string[] };
        Returns: { release_id: string; raffle_ids: string[] };
      };
      update_release: {
        Args: { p_id: string; p_name: string; p_description: string | null; p_image_url: string | null; p_release_date: string | null };
        Returns: RaffleReleaseRow;
      };
      update_raffle: {
        Args: RaffleSetupArgs & { p_id: string; p_scope: RaffleScope; p_location_id: string | null };
        Returns: RaffleRow;
      };
      publish_raffle: { Args: { p_id: string }; Returns: RaffleRow };
      cancel_raffle: { Args: { p_id: string; p_reason: string }; Returns: RaffleRow };
      staff_enter_raffle: { Args: { p_raffle_id: string; p_customer_id: string; p_choices?: string[] }; Returns: RaffleEntryRow };
      remove_raffle_entry: { Args: { p_entry_id: string; p_reason: string }; Returns: RaffleEntryRow };
      export_customer_data: { Args: { p_customer_id: string }; Returns: Record<string, unknown> };
      anonymize_customer: { Args: { p_customer_id: string; p_reason: string }; Returns: { auth_user_id: string | null } };
      report_dashboard: {
        Args: { p_from: string; p_to: string; p_location_id?: string | null };
        Returns: DashboardReport;
      };
      report_recent_activity: { Args: { p_location_id?: string | null; p_limit?: number }; Returns: RecentActivityItem[] };
      report_tier_distribution: { Args: { p_location_id?: string | null }; Returns: TierDistribution };
      report_tier_movement: { Args: { p_months?: number; p_location_id?: string | null }; Returns: TierMovementRow[] };
      report_trends: { Args: { p_from: string; p_to: string; p_location_id?: string | null }; Returns: TrendRow[] };
      report_raffle_summary: {
        Args: { p_from: string; p_to: string; p_location_id?: string | null };
        Returns: RaffleSummaryRow[];
      };
      draw_raffle: { Args: { p_raffle_id: string }; Returns: { entrants: number; winners: number } };
      notify_winners: {
        Args: { p_raffle_id: string; p_count?: number | null };
        Returns: { notified: number; call_manually: number; emails_queued: number };
      };
      raffle_email_queue: { Args: { p_raffle_id: string }; Returns: EmailQueueRow[] };
      mark_notification: { Args: { p_id: string; p_status: "sent" | "failed"; p_error?: string | null }; Returns: boolean };
      set_winner_outcome: {
        Args: { p_result_id: string; p_outcome: WinnerOutcome; p_note?: string | null };
        Returns: RaffleDrawResultRow;
      };
      next_in_line: { Args: { p_raffle_id: string }; Returns: RaffleDrawResultRow };
      claim_raffle_win: {
        Args: { p_result_id: string; p_location_id: string; p_amount_cents: number };
        Returns: RaffleDrawResultRow;
      };
      complete_raffle: { Args: { p_raffle_id: string }; Returns: RaffleRow };
      portal_raffles: { Args: Record<string, never>; Returns: PortalRaffleJson[] | null };
      portal_enter_raffle: { Args: { p_raffle_id: string; p_choices?: string[] }; Returns: boolean };
      create_product: { Args: { p_name: string; p_description?: string | null; p_image_url?: string | null }; Returns: ProductRow };
      update_product: {
        Args: { p_id: string; p_name: string; p_description: string | null; p_image_url: string | null; p_is_active: boolean };
        Returns: ProductRow;
      };
      set_raffle_products: { Args: { p_raffle_id: string; p_product_ids: string[] }; Returns: number };
      assign_raffle_product: { Args: { p_result_id: string; p_product_id: string | null }; Returns: RaffleDrawResultRow };
      portal_withdraw_entry: { Args: { p_raffle_id: string }; Returns: boolean };
      rate_limit_hit: { Args: { p_key: string; p_max: number; p_window_seconds: number }; Returns: boolean };
      bootstrap_owner: {
        Args: { p_user_id: string; p_first_name: string; p_last_name: string; p_email: string };
        Returns: EmployeeRow;
      };
    };
    Enums: { employee_role: EmployeeRole; customer_status: CustomerStatus; customer_source: CustomerSource; visit_status: VisitStatus; transaction_type: TransactionType; adjustment_direction: AdjustmentDirection; tier_key: TierKey; lookback_method: LookbackMethod };
    CompositeTypes: { [_ in never]: never };
  };
};

/** What the home page PIN sign-in returns (server only). */
export type WebPinSignInResult =
  | { result: "ok"; kind: "member" | "staff"; email: string; customer_id: string }
  | { result: "pin_not_found"; attempts_left: number }
  | { result: "locked" | "pin_locked"; minutes_left: number }
  | { result: "inactive" | "no_email" | "contact_store" };
