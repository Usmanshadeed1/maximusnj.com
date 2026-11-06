import { describe, expect, it } from "vitest";
import {
  canChangeActive,
  canChangeCustomerStatus,
  canChangeRole,
  canMergeCustomers,
  canEditStoresOf,
  canInvite,
  canManageLocations,
  canViewAuditLog,
  canViewEmployees,
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
