import type { EmployeeRole, TransactionType } from "@/types/database";

/**
 * Role rules for the staff app (PROJECT_SCOPE.md §4.1).
 * These drive what the UI offers. The database functions enforce the same rules,
 * so changing a rule means changing BOTH this file and the migration.
 */

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

export const ALL_ROLES: readonly EmployeeRole[] = ["owner", "manager", "staff"];

/** Roles this person may invite. Owner: anyone. Manager: Staff only. Staff: nobody. */
export function invitableRoles(actor: EmployeeRole): EmployeeRole[] {
  if (actor === "owner") return ["owner", "manager", "staff"];
  if (actor === "manager") return ["staff"];
  return [];
}

export function canInvite(actor: EmployeeRole, target: EmployeeRole): boolean {
  return invitableRoles(actor).includes(target);
}

/** Only the Owner promotes, demotes, deactivates and reactivates (never themselves). */
export function canChangeRole(actor: EmployeeRole, isSelf: boolean): boolean {
  return actor === "owner" && !isSelf;
}

export function canChangeActive(actor: EmployeeRole, isSelf: boolean): boolean {
  return actor === "owner" && !isSelf;
}

/** Owner: anyone's stores. Manager: Staff members' stores (limited to the manager's own stores). */
export function canEditStoresOf(actor: EmployeeRole, target: EmployeeRole): boolean {
  if (actor === "owner") return true;
  return actor === "manager" && target === "staff";
}

export function canManageLocations(actor: EmployeeRole): boolean {
  return actor === "owner";
}

/** Only the Owner creates an employee account directly with a password (Managers invite Staff by email). */
export function canCreateEmployees(actor: EmployeeRole): boolean {
  return actor === "owner";
}

/** Only the Owner deletes stores, and only empty ones (the database enforces the "empty" rule). */
export function canDeleteLocations(actor: EmployeeRole): boolean {
  return actor === "owner";
}

export function canViewEmployees(actor: EmployeeRole): boolean {
  return actor === "owner" || actor === "manager";
}

export function canViewAuditLog(actor: EmployeeRole): boolean {
  return actor === "owner";
}

/** Owner and Managers mark customers active/inactive (§5.4). Every employee can edit contact details. */
export function canChangeCustomerStatus(actor: EmployeeRole): boolean {
  return actor === "owner" || actor === "manager";
}

/** Only the Owner merges duplicate customers (§5.4). */
export function canMergeCustomers(actor: EmployeeRole): boolean {
  return actor === "owner";
}

/** Managers and Staff must be assigned to at least one store; Owners work at every store. */
export function requiresStore(role: EmployeeRole): boolean {
  return role !== "owner";
}

/**
 * Staff record purchases, refunds and trades. Owner and Managers also record membership
 * payments and manual adjustments (PROJECT_SCOPE.md §4.1, §8).
 */
export function allowedTransactionTypes(actor: EmployeeRole): TransactionType[] {
  return actor === "staff"
    ? ["purchase", "refund", "trade_buyin"]
    : ["purchase", "refund", "trade_buyin", "membership_payment", "adjustment"];
}

/** Only the Owner voids a transaction (nothing is ever deleted). */
export function canVoidTransactions(actor: EmployeeRole): boolean {
  return actor === "owner";
}

/** Staff and Managers may backdate within the current month; only the Owner can go further back. */
export function canBackdateAnyMonth(actor: EmployeeRole): boolean {
  return actor === "owner";
}

/** Only the Owner changes how tiers are earned, and sets a customer's tier by hand. */
export function canManageTiers(actor: EmployeeRole): boolean {
  return actor === "owner";
}

/** Owner and Managers link or unlink a member's online login and reset a forgotten PIN (§9.2). */
export function canManagePortalAccess(actor: EmployeeRole): boolean {
  return actor === "owner" || actor === "manager";
}

/** Owner and Managers set raffles up (Managers only for their own stores, and never company-wide: the database enforces it, §10.2). */
export function canCreateRaffles(actor: EmployeeRole): boolean {
  return actor === "owner" || actor === "manager";
}

/** Financial reports (tier distribution, trends, raffle summary) are for the Owner and Managers only (§12.2). */
export function canViewReports(actor: EmployeeRole): boolean {
  return actor === "owner" || actor === "manager";
}
