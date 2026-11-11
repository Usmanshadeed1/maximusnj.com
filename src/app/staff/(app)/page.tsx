import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Receipt, ScanLine, ShoppingBag, Undo2 } from "lucide-react";
import { BarChart } from "@/components/reports/bar-chart";
import { FilterBar, Kpi } from "@/components/reports/filter-bar";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatBusinessDateTime, formatCalendarDate, formatCents } from "@/lib/format";
import { ROLE_LABELS, canManageTiers } from "@/lib/permissions";
import { parseReportFilters } from "@/lib/report-filters";
import { nyDateString } from "@/lib/timezone";
import { friendlyRunError } from "@/lib/tier/run-messages";
import { requireEmployee } from "@/server/auth";
import { getDashboardReport, getRecentActivity } from "@/server/reports";
import { getMyActiveStores } from "@/server/store-context";
import { getRolloverFailure } from "@/server/tier-awards";

export const metadata: Metadata = { title: "Dashboard" };

export default async function StaffDashboardPage({ searchParams }: PageProps<"/staff">) {
  const employee = await requireEmployee();
  const filters = parseReportFilters(await searchParams, nyDateString(new Date()));
  const stores = await getMyActiveStores();
  // A store in the address that this person can't see is ignored (the database would refuse it anyway).
  const storeId = filters.storeId && stores.some((s) => s.id === filters.storeId) ? filters.storeId : null;

  const [report, activity, failedUpdate] = await Promise.all([
    getDashboardReport(filters.from, filters.to, storeId),
    getRecentActivity(storeId),
    canManageTiers(employee.role) ? getRolloverFailure() : Promise.resolve(null),
  ]);

  const storeName = storeId ? stores.find((s) => s.id === storeId)?.name : stores.length > 1 ? "all your stores" : stores[0]?.name;
  const visitData = report.series.map((d) => ({ label: formatCalendarDate(d.day), value: d.visits }));
  const moneyData = report.series.map((d) => ({ label: formatCalendarDate(d.day), value: d.net_cents ?? 0 }));

  return (
    <>
      <PageHeader
        title={`Welcome, ${employee.firstName}`}
        description={`${ROLE_LABELS[employee.role]} · ${formatCalendarDate(filters.from)} to ${formatCalendarDate(filters.to)} · ${storeName ?? "your stores"}`}
        actions={
          <Link href="/staff/transactions/new" className={buttonVariants({ size: "lg" })}>
            <Receipt aria-hidden /> Record transaction
          </Link>
        }
      />

      {failedUpdate && (
        <div
          role="alert"
          className="mb-5 flex flex-col gap-3 rounded-xl border-2 border-destructive/50 bg-destructive/5 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden className="mt-0.5 size-6 shrink-0 text-destructive" />
            <div>
              <p className="text-base font-bold text-destructive">This month&apos;s tier update didn&apos;t finish</p>
              <p className="mt-0.5 text-[15px]">{friendlyRunError(failedUpdate.error)} The app tries again every hour.</p>
            </div>
          </div>
          <Link href="/staff/settings/monthly-update" className={buttonVariants({ variant: "destructive" })}>
            Open Monthly update
          </Link>
        </div>
      )}

      <FilterBar basePath="/staff" filters={{ ...filters, storeId }} stores={stores} />

      <div className={report.money ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-4" : "grid gap-4 sm:grid-cols-3"}>
        <Kpi label="Members" value={report.customers_total.toLocaleString("en-US")} hint={`${report.customers_new.toLocaleString("en-US")} new in this period`} />
        <Kpi label="Visits" value={report.visits.toLocaleString("en-US")} hint={`${report.visitors.toLocaleString("en-US")} different members`} />
        {report.money && report.net_cents !== null && (
          <Kpi label="Net purchases" value={formatCents(report.net_cents)} hint="Purchases minus refunds" />
        )}
        {report.money && report.transactions !== null && (
          <Kpi label="Transactions" value={report.transactions.toLocaleString("en-US")} hint="Everything recorded, voids left out" />
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-base font-bold text-brand-navy-deep">Visits per day</h2>
          <BarChart title="Visits per day" data={visitData} format={(n) => `${n} ${n === 1 ? "visit" : "visits"}`} emptyText="No visits in this period." />
        </Card>
        {report.money ? (
          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 text-base font-bold text-brand-navy-deep">Net purchases per day</h2>
            <BarChart title="Net purchases per day" data={moneyData} format={formatCents} tone="yellow" emptyText="No sales in this period." />
          </Card>
        ) : null}
        <Card className={report.money ? "p-5 sm:p-6 lg:col-span-2" : "p-5 sm:p-6"}>
          <h2 className="mb-1 text-base font-bold text-brand-navy-deep">Recent activity</h2>
          {activity.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Nothing yet. Check-ins and sales will show up here.</p>
          ) : (
            <ul className="divide-y">
              {activity.map((item, index) => {
                const Icon = item.kind === "visit" ? ScanLine : item.kind === "refund" ? Undo2 : ShoppingBag;
                const label = item.kind === "visit" ? "checked in" : item.kind === "refund" ? "was refunded" : "bought";
                return (
                  <li key={`${item.at}-${index}`} className="flex items-center gap-3 py-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-brand-blue">
                      <Icon aria-hidden className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px]">
                        <Link href={`/staff/customers/${item.customer_id}`} className="font-semibold hover:underline">
                          {item.name}
                        </Link>{" "}
                        {label}
                        {item.amount_cents !== null && <strong className="tabular-nums"> {formatCents(item.amount_cents)}</strong>}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {item.store} · {formatBusinessDateTime(item.at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
