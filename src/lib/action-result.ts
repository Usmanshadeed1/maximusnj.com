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
  test_tools_disabled: "Test tools are turned off on this site.",
  month_not_allowed: "That month can't be used here.",
  award_immutable: "A saved monthly tier can't be edited. Use Recalculate instead.",
  visit_value_invalid: "A visit's value must be between $0 and $100,000.",
  lookback_invalid: "Look back between 1 and 24 months.",
  carry_needs_one_month: "Carry-over only works when you look back 1 month.",
  tiers_invalid: "Something is wrong with the tier list. Refresh and try again.",
  tier_name_invalid: "Each tier needs a name of up to 30 characters.",
  tier_name_duplicate: "Each tier needs a different name.",
  base_threshold_zero: "The starting tier always needs $0.",
  thresholds_not_increasing: "Each tier must need more than the one below it.",
  threshold_too_large: "One of the amounts is too large.",
  benefits_too_long: "Keep each benefits text under 500 characters.",
  no_changes: "Nothing has changed from the settings already planned.",
  override_end_invalid: "Choose the first day of this month or a later month.",
  reason_too_long: "Keep the reason under 300 characters.",
  no_override: "This member has no tier override to remove.",
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
  pin_invalid: "A PIN must be 6 to 12 numbers.",
  no_pin: "This member hasn't set a PIN.",
  no_email: "This member has no email address on file.",
  already_linked: "This member already has an online login.",
  no_login_found:
    "No verified online login uses this email yet. Ask the member to sign in at the member page first, then try again.",
  login_already_linked: "That online login is already linked to another member.",
  not_linked: "This member has no online login to remove.",
  invalid_preference: "Choose from the options shown.",
  age_required: "Please confirm you are 13 or older.",
  signup_not_allowed: "Please visit a store to finish setting up your account.",
  email_not_verified: "Please verify your email first.",
  release_name_invalid: "Give the release a name.",
  winner_count_invalid: "Choose between 1 and 10,000 winners.",
  window_invalid: "The raffle must close after it opens.",
  closes_in_past: "The closing time must be in the future.",
  claim_hours_invalid: "The claim deadline must be between 1 and 720 hours.",
  channels_invalid: "Choose from the notification options shown.",
  pickup_invalid: "Choose a valid pickup store.",
  company_owner_only: "Only the Owner can set up a company-wide raffle.",
  release_has_raffles: "This release already has raffles, so it can't get a company-wide one.",
  release_is_company: "This release has a company-wide raffle, so it can't also have store raffles.",
  raffle_locked: "This raffle can't be changed any more.",
  scope_locked: "The store can't be changed once the raffle is open.",
  opened_already: "The opening time can't be moved once the raffle has opened.",
  raffle_not_open: "This raffle isn't open for entries right now.",
  already_entered: "This member is already entered in this raffle.",
  entered_other_raffle: "This member has already entered another store's raffle for this release.",
  entry_removed: "Staff removed this entry. Please ask in a store.",
  not_active: "There is no active entry to change.",
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
