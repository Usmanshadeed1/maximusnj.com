import type { Metadata } from "next";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import {
  ROLE_LABELS,
  canChangeActive,
  canChangeRole,
  canCreateEmployees,
  canEditStoresOf,
  invitableRoles,
} from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/server/auth";
import { CreateEmployeeDialog, EmployeeActions, InviteEmployeeDialog } from "./employee-forms";

export const metadata: Metadata = { title: "Employees" };

const ROLE_ORDER = { owner: 0, manager: 1, staff: 2 } as const;

export default async function EmployeesPage() {
  const actor = await requireEmployee(["owner", "manager"]);
  const supabase = await createSupabaseServerClient();

  const [employeesRes, assignmentsRes, storesRes] = await Promise.all([
    supabase.from("employees").select("id, first_name, last_name, email, role, is_active").order("first_name"),
    supabase.from("employee_locations").select("employee_id, location_id"),
    // RLS limits this to the stores the actor may see (Owner: all, Manager: their own).
    supabase.from("locations").select("id, name, code, is_active").order("name"),
  ]);

  if (employeesRes.error || assignmentsRes.error || storesRes.error) {
    return (
      <>
        <PageHeader title="Employees" />
        <Card>
          <p role="alert" className="p-6 text-sm text-destructive">
            Couldn&apos;t load employees. Refresh the page to try again.
          </p>
        </Card>
      </>
    );
  }

  const stores = storesRes.data;
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const activeStores = stores.filter((s) => s.is_active).map((s) => ({ id: s.id, name: s.name, code: s.code }));
  const employees = [...employeesRes.data].sort(
    (a, b) => Number(!a.is_active) - Number(!b.is_active) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role],
  );

  return (
    <>
      <PageHeader
        title="Employees"
        description={
          actor.role === "owner"
            ? "Invite staff, set roles and choose which stores they work at."
            : "Invite Staff and choose which of your stores they work at."
        }
        actions={
          <>
            {canCreateEmployees(actor.role) && (
              <CreateEmployeeDialog roles={invitableRoles(actor.role)} stores={activeStores} />
            )}
            <InviteEmployeeDialog roles={invitableRoles(actor.role)} stores={activeStores} />
          </>
        }
      />
      <Card>
        {employees.length === 0 ? (
          <EmptyState icon={Users} title="No employees yet" description="Invite your first team member." />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th className="hidden md:table-cell">Stores</Th>
                <Th>Status</Th>
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </THead>
            <tbody>
              {employees.map((employee) => {
                const isSelf = employee.id === actor.id;
                const assigned = assignmentsRes.data
                  .filter((a) => a.employee_id === employee.id)
                  .map((a) => a.location_id);
                const visibleNames = assigned.flatMap((id) => storeById.get(id)?.name ?? []);
                const hiddenCount = assigned.length - visibleNames.length;

                return (
                  <Tr key={employee.id} className={employee.is_active ? undefined : "opacity-60"}>
                    <Td>
                      <p className="font-semibold">
                        {employee.first_name} {employee.last_name}
                        {isSelf && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{employee.email}</p>
                    </Td>
                    <Td>
                      <Badge variant={employee.role === "owner" ? "default" : "secondary"}>
                        {ROLE_LABELS[employee.role]}
                      </Badge>
                    </Td>
                    <Td className="hidden text-muted-foreground md:table-cell">
                      {employee.role === "owner"
                        ? "All stores"
                        : [visibleNames.join(", "), hiddenCount > 0 ? `+${hiddenCount} other` : ""]
                            .filter(Boolean)
                            .join(" ") || "—"}
                    </Td>
                    <Td>
                      <Badge variant={employee.is_active ? "success" : "outline"}>
                        {employee.is_active ? "Active" : "Deactivated"}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <EmployeeActions
                        employee={{
                          id: employee.id,
                          name: `${employee.first_name} ${employee.last_name}`,
                          role: employee.role,
                          isActive: employee.is_active,
                          locationIds: assigned,
                        }}
                        stores={activeStores}
                        can={{
                          changeRole: canChangeRole(actor.role, isSelf),
                          changeActive: canChangeActive(actor.role, isSelf),
                          editStores: employee.role !== "owner" && canEditStoresOf(actor.role, employee.role),
                        }}
                      />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
