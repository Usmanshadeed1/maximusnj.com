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
  | { result: "checked_in"; first_name: string; tier: string; qualifying: boolean }
  | { result: "already_checked_in"; first_name: string; tier: string }
  | { result: "not_found" }
  | { result: "inactive" }
  | { result: "pin_required" }
  | { result: "pin_incorrect"; attempts_left: number }
  | { result: "pin_locked"; minutes_left: number };

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
