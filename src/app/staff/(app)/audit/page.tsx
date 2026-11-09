import type { Metadata } from "next";
import { History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { formatBusinessDate, formatBusinessDateTime, formatCents } from "@/lib/format";
import { TRANSACTION_TYPE_INFO } from "@/lib/transactions";
import { formatPhone } from "@/lib/phone";
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
  "employee.create": "Employee created",
  "location.delete": "Store deleted",
  "employee.role_change": "Role changed",
  "employee.deactivate": "Employee deactivated",
  "employee.reactivate": "Employee reactivated",
  "employee.stores_change": "Stores changed",
  "customer.create": "Customer registered",
  "customer.update": "Customer edited",
  "customer.status_change": "Customer status changed",
  "customer.merge": "Customers merged",
  "transaction.adjustment": "Adjustment recorded",
  "transaction.backdated": "Back-dated entry",
  "transaction.void": "Transaction voided",
};

const CUSTOMER_FIELD_LABELS: Record<string, string> = {
  first_name: "first name",
  last_name: "last name",
  mobile_phone: "mobile phone",
  no_mobile: "no mobile",
  email: "email",
  home_location_id: "home store",
  is_under_13: "under 13",
};

type Json = AuditLogRow["after"];

/** One short, human sentence describing what changed. */
function describeChange(
  row: AuditLogRow,
  names: Map<string, string>,
  stores: Map<string, string>,
  customers: Map<string, string>,
): string {
  const before = (row.before ?? {}) as Record<string, Json>;
  const after = (row.after ?? {}) as Record<string, Json>;
  const subject =
    row.entity_id && row.entity_type === "employee"
      ? names.get(row.entity_id)
      : row.entity_id && row.entity_type === "customer"
        ? customers.get(row.entity_id)
        : undefined;
  const show = (key: string, value: Json): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (key === "mobile_phone") return formatPhone(String(value));
    if (key === "home_location_id") return stores.get(String(value)) ?? "another store";
    if (typeof value === "boolean") return value ? "yes" : "no";
    return String(value);
  };
  const storeNames = (ids: Json) =>
    Array.isArray(ids) ? ids.map((id) => stores.get(String(id)) ?? "a hidden store").join(", ") || "none" : "";

  switch (row.action) {
    case "employee.invite":
    case "employee.create":
    case "employee.bootstrap_owner":
      return `${subject ?? after.email} as ${String(after.role)}`;
    case "employee.role_change":
      return `${subject}: ${String(before.role)} → ${String(after.role)}`;
    case "employee.deactivate":
    case "employee.reactivate":
      return subject ?? "";
    case "employee.stores_change":
      return `${subject}: ${storeNames(before.location_ids)} → ${storeNames(after.location_ids)}`;
    case "transaction.adjustment":
    case "transaction.backdated":
    case "transaction.void": {
      const d = (row.action === "transaction.void" ? before : after) as Record<string, Json>;
      const who = customers.get(String(d.customer_id)) ?? "Customer";
      const kind = TRANSACTION_TYPE_INFO[d.type as keyof typeof TRANSACTION_TYPE_INFO]?.label ?? String(d.type);
      const amount = formatCents(Number(d.amount_cents));
      if (row.action === "transaction.void") return `${who}: ${kind} ${amount} voided${row.reason ? ` — ${row.reason}` : ""}`;
      if (row.action === "transaction.adjustment") {
        const counted = d.counts_toward_tier ? "counts toward tier" : "history only";
        return `${who}: ${String(d.adjustment_direction)} ${amount} (${counted})${row.reason ? ` — ${row.reason}` : ""}`;
      }
      return `${who}: ${kind} ${amount}, dated ${formatBusinessDate(String(d.occurred_at))}${d.closed_month ? " (past month)" : ""}`;
    }
    case "location.delete":
      return `${String(before.name)} (${String(before.code)})`;
    case "location.create":
      return `${String(after.name)} (${String(after.code)})`;
    case "location.update": {
      const changed = Object.keys(after).filter(
        (k) => !["updated_at", "created_at"].includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]),
      );
      return `${String(after.name)}: ${changed.join(", ") || "no changes"}`;
    }
    case "customer.create":
      return `${String(after.first_name)} ${String(after.last_name)} (${String(after.member_number)})`;
    case "customer.update": {
      const changes = Object.keys(after).map(
        (k) => `${CUSTOMER_FIELD_LABELS[k] ?? k}: ${show(k, before[k])} → ${show(k, after[k])}`,
      );
      return `${subject ?? "Customer"} — ${changes.join("; ")}`;
    }
    case "customer.status_change":
      return `${subject ?? "Customer"}: ${String(before.status)} → ${String(after.status)}${row.reason ? ` (${row.reason})` : ""}`;
    case "customer.merge":
      return `${String(before.member_number)} merged into ${String(after.merged_into_member_number)}${row.reason ? ` (${row.reason})` : ""}`;
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

  const customerIds = [
    ...new Set(
      logs.flatMap((l) => {
        if (!l.entity_id) return [];
        if (l.entity_type === "customer") return [l.entity_id];
        if (l.entity_type === "transaction") {
          const details = (l.after ?? l.before) as { customer_id?: string } | null;
          return details?.customer_id ? [details.customer_id] : [];
        }
        return [];
      }),
    ),
  ];
  const { data: customerRows } = customerIds.length
    ? await supabase.from("customers").select("id, first_name, last_name").in("id", customerIds)
    : { data: [] };
  const customers = new Map((customerRows ?? []).map((c) => [c.id, `${c.first_name} ${c.last_name}`]));

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
                  <Td>
                    <p className="font-medium whitespace-nowrap">{ACTION_LABELS[row.action] ?? row.action}</p>
                    {/* On phones the Details column is hidden, so show the details here. */}
                    <p className="mt-0.5 text-xs text-muted-foreground md:hidden">
                      {describeChange(row, names, stores, customers)}
                    </p>
                  </Td>
                  <Td className="hidden text-muted-foreground md:table-cell">{describeChange(row, names, stores, customers)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
