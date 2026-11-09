/**
 * Database types for the Supabase client.
 * Hand-written for Step 1. Once the project is linked, regenerate with:
 *   npx supabase gen types typescript --db-url "$SUPABASE_DB_URL" --schema public > src/types/database.ts
 */

export type EmployeeRole = "owner" | "manager" | "staff";

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
  | { result: "inactive" };

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
      check_in: {
        Args: { p_member_number: string; p_location_id: string; p_device_id?: string | null };
        Returns: CheckInResult;
      };
      bootstrap_owner: {
        Args: { p_user_id: string; p_first_name: string; p_last_name: string; p_email: string };
        Returns: EmployeeRow;
      };
    };
    Enums: { employee_role: EmployeeRole; customer_status: CustomerStatus; customer_source: CustomerSource; visit_status: VisitStatus };
    CompositeTypes: { [_ in never]: never };
  };
};
