import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Ticket } from "lucide-react";
import { BarChart, ShareBar } from "@/components/reports/bar-chart";
import { FilterBar } from "@/components/reports/filter-bar";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { formatBusinessDate, formatCalendarDate, formatCents, formatMonthYear } from "@/lib/format";
import { PHASE_INFO, rafflePhase } from "@/lib/raffles";
import { parseReportFilters } from "@/lib/report-filters";
import { nyDateString } from "@/lib/timezone";
import { requireEmployee } from "@/server/auth";
import { getRaffleSummary, getTierDistribution, getTierMovement, getTrends } from "@/server/reports";
import { getMyActiveStores } from "@/server/store-context";
import { getTierLabels } from "@/server/tiers";

export const metadata: Metadata = { title: "Reports" };

const TIER_COLORS = { base: "#7b8499", silver: "#a8b0c0", gold: "#e0a800", diamond: "#2b7fd4" } as const;

export default async function ReportsPage({ searchParams }: PageProps<"/staff/reports">) {
  // Staff never reach this page; the reports themselves also refuse them in the database.
  await requireEmployee(["owner", "manager"]);
  const filters = parseReportFilters(await searchParams, nyDateString(new Date()));
  const stores = await getMyActiveStores();
  const storeId = filters.storeId && stores.some((s) => s.id === filters.storeId) ? filters.storeId : null;

  const [distribution, movement, trends, raffles, labels] = await Promise.all([
    getTierDistribution(storeId),
    getTierMovement(storeId, 6),
    getTrends(filters.from, filters.to, storeId),
    getRaffleSummary(filters.from, filters.to, storeId),
    getTierLabels(),
  ]);

  // Month totals across stores, oldest first, for the charts.
  const byMonth = new Map<string, { visits: number; net: number }>();
  for (const row of trends) {
    const m = byMonth.get(row.month) ?? { visits: 0, net: 0 };
    m.visits += row.visits;
    m.net += row.net_cents;
    byMonth.set(row.month, m);
  }
  const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${formatCalendarDate(filters.from)} to ${formatCalendarDate(filters.to)}${stores.length > 1 && !storeId ? " · all your stores" : ""}`}
      />
      <FilterBar basePath="/staff/reports" filters={{ ...filters, storeId }} stores={stores} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tier distribution */}
        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-bold text-brand-navy-deep">Tier distribution</h2>
          <p className="mt-0.5 mb-4 text-sm text-muted-foreground">Active members and the tier they hold today.</p>
          {distribution.total === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No active members yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {(["diamond", "gold", "silver", "base"] as const).map((tier) => (
                <ShareBar key={tier} label={labels[tier]} value={distribution[tier]} total={distribution.total} color={TIER_COLORS[tier]} />
              ))}
              <p className="text-sm text-muted-foreground">{distribution.total.toLocaleString("en-US")} active members in total.</p>
            </div>
          )}
        </Card>

        {/* Trends charts */}
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-base font-bold text-brand-navy-deep">By month</h2>
          <p className="mb-1 text-sm font-semibold">Net purchases</p>
          <BarChart
            title="Net purchases by month"
            data={months.map(([m, v]) => ({ label: formatMonthYear(m), value: v.net }))}
            format={formatCents}
            tone="yellow"
            emptyText="No sales in this period."
            className="mb-5"
          />
          <p className="mb-1 text-sm font-semibold">Visits</p>
          <BarChart
            title="Visits by month"
            data={months.map(([m, v]) => ({ label: formatMonthYear(m), value: v.visits }))}
            format={(n) => `${n} ${n === 1 ? "visit" : "visits"}`}
            emptyText="No visits in this period."
          />
        </Card>
      </div>

      {/* Sales and visits by store */}
      <Card className="mt-6 overflow-hidden">
        <div className="p-5 pb-3 sm:p-6 sm:pb-3">
          <h2 className="text-base font-bold text-brand-navy-deep">Sales and visits by store</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Net purchases are purchases minus refunds. Trades and adjustments are not sales.</p>
        </div>
        {trends.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Nothing recorded in this period.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Month</Th>
                <Th>Store</Th>
                <Th className="text-right">Visits</Th>
                <Th className="text-right">Net purchases</Th>
                <Th className="text-right">Transactions</Th>
                <Th className="text-right">New members</Th>
              </tr>
            </THead>
            <tbody>
              {trends.map((row) => (
                <Tr key={`${row.month}-${row.location_id}`}>
                  <Td className="whitespace-nowrap">{formatMonthYear(row.month)}</Td>
                  <Td className="font-medium">{row.store}</Td>
                  <Td className="text-right tabular-nums">{row.visits.toLocaleString("en-US")}</Td>
                  <Td className="text-right font-semibold tabular-nums">{formatCents(row.net_cents)}</Td>
                  <Td className="text-right tabular-nums">{row.transactions.toLocaleString("en-US")}</Td>
                  <Td className="text-right tabular-nums">{row.new_members.toLocaleString("en-US")}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Tier movement */}
      <Card className="mt-6 overflow-hidden">
        <div className="p-5 pb-3 sm:p-6 sm:pb-3">
          <h2 className="text-base font-bold text-brand-navy-deep">Tiers by month</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            The tier each member was given at the start of the month, how many moved up or down compared with the month before, and how
            many qualified (above the starting tier).
          </p>
        </div>
        {movement.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">No monthly updates yet. The first appears on the 1st of the month.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Month</Th>
                <Th className="text-right">{labels.base}</Th>
                <Th className="text-right">{labels.silver}</Th>
                <Th className="text-right">{labels.gold}</Th>
                <Th className="text-right">{labels.diamond}</Th>
                <Th className="text-right">Qualified</Th>
                <Th className="text-right">Moved up</Th>
                <Th className="text-right">Moved down</Th>
              </tr>
            </THead>
            <tbody>
              {movement.map((row) => (
                <Tr key={row.month}>
                  <Td className="whitespace-nowrap font-medium">{formatMonthYear(row.month)}</Td>
                  <Td className="text-right tabular-nums">{row.base}</Td>
                  <Td className="text-right tabular-nums">{row.silver}</Td>
                  <Td className="text-right tabular-nums">{row.gold}</Td>
                  <Td className="text-right tabular-nums">{row.diamond}</Td>
                  <Td className="text-right font-semibold tabular-nums">{row.qualified}</Td>
                  <Td className="text-right tabular-nums text-success">
                    <span className="inline-flex items-center gap-1">
                      <ArrowUpRight aria-hidden className="size-3.5" />
                      {row.upgrades}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums text-destructive">
                    <span className="inline-flex items-center gap-1">
                      <ArrowDownRight aria-hidden className="size-3.5" />
                      {row.downgrades}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Raffles */}
      <Card className="mt-6 overflow-hidden">
        <div className="p-5 pb-3 sm:p-6 sm:pb-3">
          <h2 className="text-base font-bold text-brand-navy-deep">Raffle summary</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Raffles that closed in this period.</p>
        </div>
        {raffles.length === 0 ? (
          <EmptyState icon={Ticket} title="No raffles closed in this period" description="Pick a longer date range to see earlier raffles." />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Release</Th>
                <Th>Store</Th>
                <Th>Closed</Th>
                <Th className="text-right">Entries</Th>
                <Th className="text-right">Online / store</Th>
                <Th className="text-right">Winners</Th>
                <Th className="text-right">Collected</Th>
                <Th className="text-right">Expired</Th>
                <Th className="text-right">Declined</Th>
                <Th className="text-right">Waiting</Th>
                <Th className="text-right">Sales</Th>
              </tr>
            </THead>
            <tbody>
              {raffles.map((r) => (
                <Tr key={r.raffle_id}>
                  <Td className="font-medium">
                    <Link href={`/staff/raffles/${r.release_id}/${r.raffle_id}`} className="hover:underline">
                      {r.release}
                    </Link>
                    <p className="text-xs font-normal text-muted-foreground">{PHASE_INFO[rafflePhase(r.status, r.closes_at, r.closes_at)].label}</p>
                  </Td>
                  <Td>{r.store}</Td>
                  <Td className="whitespace-nowrap">{formatBusinessDate(r.closes_at)}</Td>
                  <Td className="text-right font-semibold tabular-nums">{r.entries}</Td>
                  <Td className="text-right tabular-nums">
                    {r.online} / {r.in_store}
                  </Td>
                  <Td className="text-right tabular-nums">{r.winner_count}</Td>
                  <Td className="text-right tabular-nums text-success">{r.claimed}</Td>
                  <Td className="text-right tabular-nums">{r.expired}</Td>
                  <Td className="text-right tabular-nums">{r.declined}</Td>
                  <Td className="text-right tabular-nums">{r.waiting}</Td>
                  <Td className="text-right font-semibold tabular-nums">{formatCents(r.sales_cents)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
