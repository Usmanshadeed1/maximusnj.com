import type { Metadata } from "next";
import { History } from "lucide-react";
import Link from "next/link";
import { nyWallTimeToInstant } from "@/lib/timezone";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { formatBusinessDate, formatBusinessDateTime, formatCalendarDate, formatCents, formatMonthYear } from "@/lib/format";
import { TRANSACTION_TYPE_INFO } from "@/lib/transactions";
import { formatPhone } from "@/lib/phone";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/server/auth";
import type { AuditLogRow } from "@/types/database";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 100;

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
  "tier_rules.update": "Tier rules updated",
  "customer.tier_override_set": "Tier set by hand",
  "customer.tier_override_clear": "Tier override removed",
  "tier_rollover.run": "Monthly tier update ran",
  "tier_rollover.test_run": "Month-end test run",
  "tier_awards.recalculate": "Tiers recalculated",
  "customer.tier_recalculate": "Member's tier recalculated",
  "customer.login_linked": "Online login linked",
  "customer.login_unlinked": "Online login removed",
  "customer.online_signup": "Member joined online",
  "customer.pin_set": "PIN set",
  "customer.pin_change": "PIN changed",
  "customer.pin_reset": "PIN reset by staff",
  "customer.pin_locked": "PIN locked after wrong tries",
  "customer.notify_prefs_change": "Raffle notification choice changed",
  "raffle.release_create": "Release created",
  "raffle.release_update": "Release edited",
  "raffle.create": "Raffle added",
  "raffle.update": "Raffle edited",
  "raffle.publish": "Raffle opened for entries",
  "raffle.cancel": "Raffle cancelled",
  "raffle.entry_add": "Raffle entry added",
  "raffle.entry_withdraw": "Raffle entry withdrawn",
  "raffle.entry_remove": "Raffle entry removed",
  "raffle.draw": "Raffle drawn",
  "raffle.notify": "Winners notified",
  "raffle.winner_notified": "Winner marked as told",
  "raffle.winner_expired": "Winner marked as expired",
  "raffle.winner_declined": "Winner marked as declined",
  "raffle.winner_claimed": "Winner collected",
  "raffle.next_in_line": "Next in line promoted",
  "raffle.complete": "Raffle finished",
};

/** The groups offered in the filter, as action prefixes. */
const CATEGORIES: { key: string; label: string; prefixes: string[] }[] = [
  { key: "people", label: "Employees", prefixes: ["employee."] },
  { key: "stores", label: "Stores", prefixes: ["location."] },
  { key: "customers", label: "Customers", prefixes: ["customer.create", "customer.update", "customer.status_change", "customer.merge"] },
  { key: "portal", label: "Member page and PIN", prefixes: ["customer.login", "customer.online", "customer.pin", "customer.notify"] },
  { key: "money", label: "Money", prefixes: ["transaction."] },
  { key: "tiers", label: "Tiers", prefixes: ["tier_", "customer.tier"] },
  { key: "raffles", label: "Raffles", prefixes: ["raffle."] },
];

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
    case "tier_rollover.run":
    case "tier_rollover.test_run": {
      const month = formatMonthYear(String(after.awarded_month));
      return after.status === "succeeded"
        ? `${month}: ${String(after.processed)} members decided${Number(after.skipped) > 0 ? `, ${String(after.skipped)} already had a tier` : ""}`
        : `${month}: didn't finish — ${String(after.error ?? "unknown problem")}`;
    }
    case "tier_awards.recalculate":
      return `${formatMonthYear(String(after.awarded_month))}: ${String(after.changed)} of ${String(after.members)} members got a new result${row.reason ? ` — ${row.reason}` : ""}`;
    case "customer.tier_recalculate": {
      const cap = (v: Json) => String(v).charAt(0).toUpperCase() + String(v).slice(1);
      const month = formatMonthYear(String(after.awarded_month));
      return after.unchanged
        ? `${subject ?? "Customer"}: ${month} checked — no change${row.reason ? ` — ${row.reason}` : ""}`
        : `${subject ?? "Customer"}: ${month} ${before.tier_key ? `${cap(before.tier_key)} → ` : ""}${cap(after.tier_key)}${row.reason ? ` — ${row.reason}` : ""}`;
    }
    case "tier_rules.update":
      return `Version ${String(after.version)} saved — starts ${formatCalendarDate(String(after.effective_from_month))}`;
    case "customer.tier_override_set": {
      const cap = (v: Json) => String(v).charAt(0).toUpperCase() + String(v).slice(1);
      const from = before.tier_key ? `${cap(before.tier_key)} → ` : "";
      const until = after.last_month ? ` until the end of ${formatMonthYear(String(after.last_month))}` : "";
      return `${subject ?? "Customer"}: ${from}${cap(after.tier_key)}${until}${row.reason ? ` — ${row.reason}` : ""}`;
    }
    case "customer.tier_override_clear": {
      const tier = String(before.tier_key ?? "");
      return `${subject ?? "Customer"}: ${tier.charAt(0).toUpperCase() + tier.slice(1)} override removed${row.reason ? ` — ${row.reason}` : ""}`;
    }
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
    case "customer.login_linked":
      return `${subject ?? "Customer"}: linked ${after.linked_via === "staff" ? "by staff" : after.linked_via === "online_signup" ? "at online sign-up" : "automatically"}`;
    case "customer.login_unlinked":
      return `${subject ?? "Customer"}${row.reason ? ` — ${row.reason === "email_changed" ? "their email was changed" : row.reason}` : ""}`;
    case "customer.online_signup":
      return `${subject ?? "Customer"} (${String(after.member_number)})`;
    case "customer.pin_set":
    case "customer.pin_change":
    case "customer.pin_locked":
      return subject ?? "";
    case "customer.pin_reset":
      return `${subject ?? "Customer"}${row.reason ? ` — ${row.reason}` : ""}`;
    case "customer.notify_prefs_change":
      return `${subject ?? "Customer"}: ${(Array.isArray(after.raffle_notify_prefs) ? after.raffle_notify_prefs : []).join(", ") || "none"}`;
    case "raffle.release_create":
      return `${String(after.name)}: ${String(after.scope === "company" ? "one raffle for all stores" : `${Array.isArray(after.raffles) ? after.raffles.length : 1} store raffle(s)`)}, ${String(after.winner_count)} winner(s)`;
    case "raffle.release_update":
      return String(after.name ?? "");
    case "raffle.create":
      return `${Array.isArray(after.raffles) ? after.raffles.length : 1} raffle(s) added`;
    case "raffle.update":
      return `Winners ${String(before.winner_count)} → ${String(after.winner_count)}; closes ${formatBusinessDateTime(String(after.closes_at))}`;
    case "raffle.publish":
      return "Draft → open";
    case "raffle.cancel":
      return row.reason ?? "";
    case "raffle.entry_add":
    case "raffle.entry_withdraw":
      return `${customers.get(String((after.customer_id ?? before.customer_id) as string)) ?? subject ?? "Member"}${after.channel ? ` (${after.channel === "online" ? "online" : "in store"})` : ""}`;
    case "raffle.entry_remove":
      return `${customers.get(String(before.customer_id)) ?? "Member"} — ${row.reason ?? ""}`;
    case "raffle.draw":
      return `${String(after.entrants)} people ranked, ${String(after.winners)} winner(s)`;
    case "raffle.notify":
      return `${String(after.notified)} told, ${String(after.call_manually)} to phone, ${String(after.emails_queued)} email(s)`;
    case "raffle.winner_notified":
    case "raffle.winner_expired":
    case "raffle.winner_declined":
    case "raffle.winner_claimed":
      return `#${String(before.position ?? "")} ${customers.get(String(after.customer_id)) ?? ""}${row.reason ? ` — ${row.reason}` : ""}`.trim();
    case "raffle.next_in_line":
      return `#${String(after.position)} ${customers.get(String(after.customer_id)) ?? ""}`.trim();
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

type AuditSearch = { category?: string; from?: string; to?: string; who?: string; before?: string };

function addDay(date: string): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export default async function AuditLogPage({ searchParams }: PageProps<"/staff/audit">) {
  await requireEmployee(["owner"]);
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const search: AuditSearch = { category: one(raw.category), from: one(raw.from), to: one(raw.to), who: one(raw.who), before: one(raw.before) };
  const category = CATEGORIES.find((c) => c.key === search.category);
  const dateOk = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const from = dateOk(search.from);
  const to = dateOk(search.to);
  const who = search.who && /^[0-9a-f-]{36}$/i.test(search.who) ? search.who : undefined;
  const before = search.before && /^\d{1,15}$/.test(search.before) ? Number(search.before) : undefined;

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("audit_logs").select("*").order("id", { ascending: false }).limit(PAGE_SIZE);
  if (category) query = query.or(category.prefixes.map((p) => `action.like.${p}*`).join(","));
  // Days are New York days; the stored times are exact instants.
  if (from) query = query.gte("created_at", nyWallTimeToInstant(from, "00:00").toISOString());
  if (to) query = query.lt("created_at", nyWallTimeToInstant(addDay(to), "00:00").toISOString());
  if (who) query = query.eq("actor_id", who);
  if (before) query = query.lt("id", before);

  const [logsRes, employeesRes, storesRes] = await Promise.all([
    query,
    supabase.from("employees").select("id, first_name, last_name").order("first_name"),
    supabase.from("locations").select("id, name"),
  ]);

  const names = new Map((employeesRes.data ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]));
  const stores = new Map((storesRes.data ?? []).map((s) => [s.id, s.name]));
  const logs = logsRes.data ?? [];

  const customerIds = [
    ...new Set(
      logs.flatMap((l) => {
        const ids: string[] = [];
        if (l.entity_id && l.entity_type === "customer") ids.push(l.entity_id);
        if (l.actor_type === "customer" && l.actor_id) ids.push(l.actor_id);
        for (const detail of [l.after, l.before] as ({ customer_id?: string } | null)[]) {
          if (detail && typeof detail === "object" && typeof detail.customer_id === "string") ids.push(detail.customer_id);
        }
        return ids;
      }),
    ),
  ];
  const { data: customerRows } = customerIds.length
    ? await supabase.from("customers").select("id, first_name, last_name").in("id", customerIds)
    : { data: [] };
  const customers = new Map((customerRows ?? []).map((c) => [c.id, `${c.first_name} ${c.last_name}`]));
  const actorName = (row: AuditLogRow) =>
    row.actor_type === "system"
      ? "System"
      : row.actor_type === "customer"
        ? `${customers.get(row.actor_id ?? "") ?? "A member"} (member)`
        : (names.get(row.actor_id ?? "") ?? "Unknown");

  const filtered = Boolean(category || from || to || who);
  const next = logs.length === PAGE_SIZE ? logs[logs.length - 1].id : null;
  const nextParams = new URLSearchParams();
  if (category) nextParams.set("category", category.key);
  if (from) nextParams.set("from", from);
  if (to) nextParams.set("to", to);
  if (who) nextParams.set("who", who);
  if (next !== null) nextParams.set("before", String(next));

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every sensitive change, newest first. Entries can't be edited or deleted."
      />

      <Card className="mb-6 p-4 sm:p-5">
        <form method="get" action="/staff/audit" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="category" className="text-sm font-semibold">
              What
            </label>
            <Select id="category" name="category" defaultValue={category?.key ?? ""}>
              <option value="">Everything</option>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="who" className="text-sm font-semibold">
              Who
            </label>
            <Select id="who" name="who" defaultValue={who ?? ""}>
              <option value="">Anyone</option>
              {(employeesRes.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="from" className="text-sm font-semibold">
              From
            </label>
            <Input id="from" name="from" type="date" defaultValue={from ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="to" className="text-sm font-semibold">
              To
            </label>
            <Input id="to" name="to" type="date" defaultValue={to ?? ""} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="lg">
              Filter
            </Button>
            {(filtered || before) && (
              <Link href="/staff/audit" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Clear
              </Link>
            )}
          </div>
        </form>
      </Card>

      <Card>
        {logsRes.error ? (
          <p role="alert" className="p-6 text-sm text-destructive">
            Couldn&apos;t load the audit log. Refresh the page to try again.
          </p>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={History}
            title={filtered || before ? "Nothing matches" : "Nothing logged yet"}
            description={filtered || before ? "Try a wider date range or a different filter." : "Changes to stores and employees appear here."}
          />
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
                  <Td className="whitespace-nowrap">{actorName(row)}</Td>
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

      {next !== null && (
        <div className="mt-5 flex justify-center">
          <Link href={`/staff/audit?${nextParams.toString()}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Older entries
          </Link>
        </div>
      )}
    </>
  );
}
