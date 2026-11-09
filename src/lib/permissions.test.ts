import { describe, expect, it } from "vitest";
import {
  allowedTransactionTypes,
  canBackdateAnyMonth,
  canChangeActive,
  canChangeCustomerStatus,
  canChangeRole,
  canCreateEmployees,
  canDeleteLocations,
  canMergeCustomers,
  canEditStoresOf,
  canInvite,
  canManageTiers,
  canManageLocations,
  canViewAuditLog,
  canViewEmployees,
  canVoidTransactions,
  invitableRoles,
} from "./permissions";

describe("inviting", () => {
  it("Owner can invite every role", () => {
    expect(invitableRoles("owner")).toEqual(["owner", "manager", "staff"]);
  });

  it("Manager can invite Staff only", () => {
    expect(canInvite("manager", "staff")).toBe(true);
    expect(canInvite("manager", "manager")).toBe(false);
    expect(canInvite("manager", "owner")).toBe(false);
  });

  it("Staff cannot invite anyone", () => {
    expect(invitableRoles("staff")).toEqual([]);
  });
});

describe("role and status changes", () => {
  it("only the Owner can promote or deactivate", () => {
    expect(canChangeRole("owner", false)).toBe(true);
    expect(canChangeActive("owner", false)).toBe(true);
    expect(canChangeRole("manager", false)).toBe(false);
    expect(canChangeActive("manager", false)).toBe(false);
    expect(canChangeRole("staff", false)).toBe(false);
  });

  it("nobody changes their own role or deactivates themselves", () => {
    expect(canChangeRole("owner", true)).toBe(false);
    expect(canChangeActive("owner", true)).toBe(false);
  });
});

describe("store assignments", () => {
  it("Owner edits anyone; Manager edits Staff only; Staff edits nobody", () => {
    expect(canEditStoresOf("owner", "manager")).toBe(true);
    expect(canEditStoresOf("manager", "staff")).toBe(true);
    expect(canEditStoresOf("manager", "manager")).toBe(false);
    expect(canEditStoresOf("staff", "staff")).toBe(false);
  });
});

describe("owner-only actions", () => {
  it("only the Owner creates employees directly and deletes stores", () => {
    expect(canCreateEmployees("owner")).toBe(true);
    expect(canCreateEmployees("manager")).toBe(false);
    expect(canCreateEmployees("staff")).toBe(false);
    expect(canDeleteLocations("owner")).toBe(true);
    expect(canDeleteLocations("manager")).toBe(false);
    expect(canDeleteLocations("staff")).toBe(false);
  });
});

describe("transactions", () => {
  it("Staff record purchases, refunds and trades only", () => {
    expect(allowedTransactionTypes("staff")).toEqual(["purchase", "refund", "trade_buyin"]);
  });

  it("Owner and Managers can record every type", () => {
    expect(allowedTransactionTypes("manager")).toContain("adjustment");
    expect(allowedTransactionTypes("manager")).toContain("membership_payment");
    expect(allowedTransactionTypes("owner")).toHaveLength(5);
  });

  it("only the Owner voids and backdates into closed months", () => {
    expect(canVoidTransactions("owner")).toBe(true);
    expect(canVoidTransactions("manager")).toBe(false);
    expect(canBackdateAnyMonth("owner")).toBe(true);
    expect(canBackdateAnyMonth("manager")).toBe(false);
    expect(canBackdateAnyMonth("staff")).toBe(false);
  });
});

describe("tiers", () => {
  it("only the Owner manages tier settings and overrides", () => {
    expect(canManageTiers("owner")).toBe(true);
    expect(canManageTiers("manager")).toBe(false);
    expect(canManageTiers("staff")).toBe(false);
  });
});

describe("customers", () => {
  it("Owner and Manager change customer status; only Owner merges", () => {
    expect(canChangeCustomerStatus("owner")).toBe(true);
    expect(canChangeCustomerStatus("manager")).toBe(true);
    expect(canChangeCustomerStatus("staff")).toBe(false);
    expect(canMergeCustomers("owner")).toBe(true);
    expect(canMergeCustomers("manager")).toBe(false);
  });
});

describe("screen access", () => {
  it("Stores and Audit log are Owner only; Employees is Owner and Manager", () => {
    expect(canManageLocations("owner")).toBe(true);
    expect(canManageLocations("manager")).toBe(false);
    expect(canViewAuditLog("owner")).toBe(true);
    expect(canViewAuditLog("manager")).toBe(false);
    expect(canViewEmployees("manager")).toBe(true);
    expect(canViewEmployees("staff")).toBe(false);
  });
});
