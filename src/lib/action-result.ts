import { z } from "zod";

/** Every server action returns this shape so forms can show plain-language feedback. */
export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const idleState: ActionState = {};

export function validationFailed(error: z.ZodError): ActionState {
  return { error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(error).fieldErrors };
}

const DB_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to do that.",
  managers_invite_staff_only: "Managers can only invite Staff.",
  managers_manage_staff_only: "Managers can only change Staff members' stores.",
  outside_your_stores: "You can only choose stores you are assigned to.",
  store_required: "Choose at least one store.",
  invalid_location: "One of the chosen stores is missing or inactive.",
  cannot_change_own_role: "You can't change your own role.",
  cannot_deactivate_self: "You can't deactivate your own account.",
  last_owner: "There must always be at least one active Owner.",
  not_found: "That record no longer exists.",
  owner_exists: "An Owner account already exists.",
  name_required: "First and last name are required.",
  mobile_required: "Mobile number is required unless “No mobile number” is ticked.",
  customer_merged: "This customer was merged into another record and can't be changed.",
  member_number_immutable: "Member numbers can never be changed.",
  merge_same_customer: "Choose a different member to keep.",
  reason_required: "Please give a reason.",
  amount_invalid: "Enter an amount greater than $0.00.",
  amount_too_large: "That amount is too large. Check for a typing mistake.",
  note_too_long: "Keep the note under 500 characters.",
  future_date: "The date can't be in the future.",
  closed_month_owner_only: "Only the Owner can record entries dated in a past month.",
  type_not_allowed: "You don't have permission to record that type of transaction.",
  customer_inactive: "This member is inactive. Reactivate them before recording anything.",
  direction_required: "Choose whether the adjustment adds to or subtracts from spend.",
  note_required: "A note is required for adjustments.",
  refund_link_invalid: "Choose a purchase from this customer's list.",
  refund_exceeds_purchase: "That's more than is left to refund on that purchase.",
  already_voided: "This transaction is already voided.",
  has_active_refunds: "This purchase has refunds. Void the refunds first.",
  transaction_immutable: "Transactions can't be edited or deleted. Use a void or a reversing entry.",
  name_mismatch: "The name you typed doesn't match the store name.",
  store_has_history:
    "This store has customers, visits or staff, so it can't be deleted without losing their history. Deactivate it instead.",
};

/** Turns a Supabase/Postgres error into a message that's safe and clear for staff. */
export function friendlyDbError(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return "Something went wrong. Please try again.";
  const known = error.message ? DB_MESSAGES[error.message] : undefined;
  if (known) return known;
  if (error.code === "23505") return "That already exists. Check for a duplicate.";
  if (error.code === "42501") return DB_MESSAGES.forbidden;
  return "Something went wrong. Please try again.";
}
