import type { Metadata } from "next";
import { History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { formatBusinessDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/server/auth";
import type { AuditLogRow } from "@/types/database";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 200;

const ACTION_LABELS: Record<string, string> = {
  "location.create": "Store added",
  "location.update": "Store edited",
  "employee.bootstrap_owner": "Owner account created",
  "employee.invite": "Employee invited",
  "employee.role_change": "Role changed",
  "employee.deactivate": "Employee deactivated",
  "employee.reactivate": "Employee reactivated",
  "employee.stores_change": "Stores changed",
};

type Json = AuditLogRow["after"];

/** One short, human sentence describing what changed. */
function describeChange(row: AuditLogRow, names: Map<string, string>, stores: Map<string, string>): string {
  const before = (row.before ?? {}) as Record<string, Json>;
  const after = (row.after ?? {}) as Record<string, Json>;
  const subject = row.entity_type === "employee" && row.entity_id ? names.get(row.entity_id) : undefined;
  const storeNames = (ids: Json) =>
    Array.isArray(ids) ? ids.map((id) => stores.get(String(id)) ?? "a hidden store").join(", ") || "none" : "";

  switch (row.action) {
    case "employee.invite":
    case "employee.bootstrap_owner":
      return `${subject ?? after.email} as ${String(after.role)}`;
    case "employee.role_change":
      return `${subject}: ${String(before.role)} → ${String(after.role)}`;
    case "employee.deactivate":
    case "employee.reactivate":
      return subject ?? "";
    case "employee.stores_change":
      return `${subject}: ${storeNames(before.location_ids)} → ${storeNames(after.location_ids)}`;
    case "location.create":
      return `${String(after.name)} (${String(after.code)})`;
    case "location.update": {
      const changed = Object.keys(after).filter(
        (k) => !["updated_at", "created_at"].includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]),
      );
      return `${String(after.name)}: ${changed.join(", ") || "no changes"}`;
    }
    default:
      return row.entity_id ?? "";
  }
}

export default async function AuditLogPage() {
  await requireEmployee(["owner"]);
  const supabase = await createSupabaseServerClient();

  const [logsRes, employeesRes, storesRes] = await Promise.all([
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(PAGE_SIZE),
    supabase.from("employees").select("id, first_name, last_name"),
    supabase.from("locations").select("id, name"),
  ]);

  const names = new Map((employeesRes.data ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]));
  const stores = new Map((storesRes.data ?? []).map((s) => [s.id, s.name]));
  const logs = logsRes.data ?? [];

  return (
    <>
      <PageHeader
        title="Audit log"
        description={`Every sensitive change, newest first (last ${PAGE_SIZE}). Entries can't be edited or deleted.`}
      />
      <Card>
        {logsRes.error ? (
          <p role="alert" className="p-6 text-sm text-destructive">
            Couldn&apos;t load the audit log. Refresh the page to try again.
          </p>
        ) : logs.length === 0 ? (
          <EmptyState icon={History} title="Nothing logged yet" description="Changes to stores and employees appear here." />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>When (New York)</Th>
                <Th>Who</Th>
                <Th>What</Th>
                <Th className="hidden md:table-cell">Details</Th>
              </tr>
            </THead>
            <tbody>
              {logs.map((row) => (
                <Tr key={row.id}>
                  <Td className="whitespace-nowrap text-muted-foreground">{formatBusinessDateTime(row.created_at)}</Td>
                  <Td className="whitespace-nowrap">
                    {row.actor_type === "system" ? "System" : (names.get(row.actor_id ?? "") ?? "Unknown")}
                  </Td>
                  <Td className="font-medium whitespace-nowrap">{ACTION_LABELS[row.action] ?? row.action}</Td>
                  <Td className="hidden text-muted-foreground md:table-cell">{describeChange(row, names, stores)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
