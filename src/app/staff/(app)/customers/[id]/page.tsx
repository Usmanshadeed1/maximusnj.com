import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarCheck, CheckCircle2, GitMerge, Pencil, Printer, ScanLine, UserPlus } from "lucide-react";
import { CustomerBadges } from "@/components/customers/customer-badges";
import { MemberCard } from "@/components/customers/member-card";
import { TierBadge } from "@/components/tier-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatBusinessDate, formatBusinessDateTime, formatMonthYear, formatCents } from "@/lib/format";
import { addMonths, nyMonthStartString } from "@/lib/timezone";
import {
  canChangeCustomerStatus,
  canManagePortalAccess,
  canManageTiers,
  canMergeCustomers,
  canVoidTransactions,
} from "@/lib/permissions";
import { formatPhone } from "@/lib/phone";
import { requireEmployee } from "@/server/auth";
import { getCustomer, getVisitSummary } from "@/server/customers";
import { getPortalStatus } from "@/server/portal-staff";
import { getMemberRaffles } from "@/server/member-raffles";
import { buildTimeline } from "@/lib/timeline";
import { getAwardHistory, isTestToolsEnabled } from "@/server/tier-awards";
import { getCustomerTierView } from "@/server/tiers";
import { getSpend, getTransactions } from "@/server/transactions";
import { MergeCustomerDialog, StatusDialog } from "./customer-actions";
import { PrivacyActions } from "./privacy-dialog";
import { ActivityTimelineCard, RaffleHistoryCard } from "./history-cards";
import { PortalAccessCard } from "./portal-access-card";
import { getMemberGiftCards } from "@/server/gift-cards";
import { SpendingCard, TransactionsCard } from "./spending-cards";
import { MonthlyTiersCard } from "./monthly-tiers-card";
import { TierCard } from "./tier-card";

export const metadata: Metadata = { title: "Customer" };

const SOURCE_LABELS = { staff: "In store", online: "Online sign-up", migration: "Imported from the old system" };

export default async function CustomerPage({ params, searchParams }: PageProps<"/staff/customers/[id]">) {
  const employee = await requireEmployee();
  const [{ id }, flags] = await Promise.all([params, searchParams]);
  const [customer, visits, spend, transactions, tierView, awards, testTools, portalStatus, raffles, giftCards] = await Promise.all([
    getCustomer(id),
    getVisitSummary(id),
    getSpend(id),
    getTransactions(id),
    getCustomerTierView(id),
    getAwardHistory(id),
    canManageTiers(employee.role) ? isTestToolsEnabled() : Promise.resolve(false),
    getPortalStatus(id),
    getMemberRaffles(id),
    getMemberGiftCards(id),
  ]);
  if (!customer) notFound();

  const name = `${customer.first_name} ${customer.last_name}`;
  const timeline = buildTimeline({
    visits: visits.recent,
    transactions,
    awards,
    raffles: raffles.map((r) => ({ at: r.at, release: r.release, store: r.store, channel: r.channel, status: r.status, outcome: r.outcome })),
  });
  const isMerged = Boolean(customer.merged_into_id);
  const justRegistered = flags.new === "1";

  // The months an Owner can end a tier override at: this month and the next 11.
  const thisMonth = nyMonthStartString(new Date());
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const value = addMonths(thisMonth, i);
    return { value, label: `${formatMonthYear(value)}${i === 0 ? " (this month)" : ""}` };
  });
  // Months an Owner can decide again: this month and the 11 before it.
  const recalcOptions = [
    // On a test site the Owner can also correct next month's test result.
    ...(testTools ? [{ value: addMonths(thisMonth, 1), label: `${formatMonthYear(addMonths(thisMonth, 1))} (next month, test)` }] : []),
    ...Array.from({ length: 12 }, (_, i) => {
      const value = addMonths(thisMonth, -i);
      return { value, label: `${formatMonthYear(value)}${i === 0 ? " (this month)" : ""}` };
    }),
  ];

  return (
    <>
      <Link
        href="/staff/customers"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" /> Customers
      </Link>

      {justRegistered && (
        <div
          role="status"
          className="mb-6 flex flex-col gap-4 rounded-xl border border-success/30 bg-success/8 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 aria-hidden className="mt-1 size-6 shrink-0 text-success" />
            <div>
              <p className="font-semibold text-success">Member registered</p>
              <p className="mt-1 text-sm text-muted-foreground">Their member number is</p>
              <p className="font-mono text-4xl font-bold tracking-[0.12em] text-brand-navy-deep sm:text-5xl">
                {customer.member_number}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <Link href={`/staff/print/card/${customer.id}`} className={buttonVariants({ size: "lg" })}>
              <Printer aria-hidden /> Print card
            </Link>
            <Link href="/staff/customers/new" className={buttonVariants({ variant: "outline" })}>
              <UserPlus aria-hidden /> Register another
            </Link>
          </div>
        </div>
      )}
      {flags.pin === "ok" && <Notice>The customer&apos;s PIN is set.</Notice>}
      {typeof flags.pin === "string" && flags.pin !== "ok" && (
        <div role="alert" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3.5 text-sm font-medium text-amber-900">
          The member is registered, but their PIN wasn&apos;t saved: {flags.pin} Use Set PIN below to choose another.
        </div>
      )}
      {flags.saved === "1" && <Notice>Changes saved.</Notice>}
      {flags.merged === "1" && <Notice>Duplicate merged into this member.</Notice>}
      {flags.recorded === "1" && <Notice>Transaction recorded.</Notice>}

      {isMerged && customer.mergedInto && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <GitMerge aria-hidden className="size-4" />
          This record was merged into
          <Link href={`/staff/customers/${customer.mergedInto.id}`} className="font-semibold underline">
            {customer.mergedInto.name} ({customer.mergedInto.memberNumber})
          </Link>
          . It is kept for history and can&apos;t be changed.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-brand-navy-deep sm:text-3xl">{name}</h1>
                <p className="mt-1 font-mono text-lg font-semibold tracking-[0.12em] text-brand-blue">
                  {customer.member_number}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <TierBadge tier={tierView.current.key} label={tierView.current.label} />
                  <CustomerBadges customer={customer} />
                </div>
              </div>
              {!isMerged && (
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Link href={`/staff/customers/${customer.id}/edit`} className={buttonVariants({ variant: "outline" })}>
                    <Pencil aria-hidden /> Edit
                  </Link>
                  <Link href={`/staff/print/card/${customer.id}`} className={buttonVariants({ variant: "outline" })}>
                    <Printer aria-hidden /> Print card
                  </Link>
                </div>
              )}
            </div>
          </Card>

          {!isMerged && (
            <TierCard
              view={tierView}
              awards={awards}
              customerId={customer.id}
              customerName={name}
              canManage={canManageTiers(employee.role)}
              monthOptions={monthOptions}
            />
          )}

          {!isMerged && (
            <MonthlyTiersCard
              awards={awards}
              customerId={customer.id}
              customerName={name}
              canManage={canManageTiers(employee.role)}
              monthOptions={recalcOptions}
            />
          )}

          <SpendingCard spend={spend} />

          <TransactionsCard
            transactions={transactions}
            customerId={customer.id}
            recordHref={`/staff/transactions/new?customer=${customer.id}`}
            canVoid={canVoidTransactions(employee.role)}
            canRecord={!isMerged && customer.status === "active"}
          />

          <ActivityTimelineCard items={timeline} />

          <RaffleHistoryCard raffles={raffles} />

          {!isMerged && portalStatus && (
            <PortalAccessCard
              status={portalStatus}
              customerId={customer.id}
              name={name}
              hasEmail={Boolean(customer.email)}
              canManage={canManagePortalAccess(employee.role)}
            />
          )}

          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 text-base font-bold text-brand-navy-deep">Details</h2>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Detail label="Mobile phone">
                {customer.mobile_phone ? (
                  <a href={`tel:${customer.mobile_phone}`} className="hover:underline">
                    {formatPhone(customer.mobile_phone)}
                  </a>
                ) : (
                  <span className="text-muted-foreground">No mobile number</span>
                )}
              </Detail>
              <Detail label="Email">
                {customer.email ? (
                  <a href={`mailto:${customer.email}`} className="break-all hover:underline">
                    {customer.email}
                  </a>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </Detail>
              <Detail label="Home store">{customer.homeStoreName}</Detail>
              <Detail label="Current tier">{tierView.current.label}</Detail>
              <Detail label="Member since">{formatBusinessDate(customer.created_at)}</Detail>
              <Detail label="Registered">
                {SOURCE_LABELS[customer.created_via]}
                {customer.createdByName ? ` by ${customer.createdByName}` : ""}
              </Detail>
            </dl>
            {customer.is_under_13 && (
              <p className="mt-4 rounded-md bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">
                Under 13 — contact details belong to a parent or guardian.
              </p>
            )}
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold text-brand-navy-deep">Visits</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                <CalendarCheck aria-hidden className="size-3.5" />
                {visits.qualifyingDaysThisMonth} {visits.qualifyingDaysThisMonth === 1 ? "day" : "days"} this month count toward tier
              </span>
            </div>
            {visits.recent.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-4 py-4 text-sm text-muted-foreground">
                <ScanLine aria-hidden className="size-5 shrink-0" />
                No visits yet. Visits appear here when the member scans in at the check-in kiosk.
              </div>
            ) : (
              <ul className="divide-y">
                {visits.recent.map((visit) => (
                  <li key={visit.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                    <div>
                      <p className="text-[15px] font-medium">{formatBusinessDateTime(visit.checkedInAt)}</p>
                      <p className="text-sm text-muted-foreground">{visit.storeName}</p>
                    </div>
                    <span className="flex items-center gap-2">
                      {visit.counted ? (
                        <Badge variant={visit.qualifying ? "success" : "secondary"}>
                          {visit.qualifying ? "Counts toward tier" : "Visit (already counted today)"}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Repeat scan</Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {!isMerged &&
            (canChangeCustomerStatus(employee.role) || canMergeCustomers(employee.role)) && (
              <Card className="p-5 sm:p-6">
                <h2 className="text-base font-bold text-brand-navy-deep">Manage membership</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Inactive members can&apos;t check in or enter raffles. Merging combines a duplicate into the record you
                  keep.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {canChangeCustomerStatus(employee.role) && (
                    <StatusDialog customerId={customer.id} name={name} status={customer.status} />
                  )}
                  {employee.role === "owner" && !customer.anonymized_at && (
                    <PrivacyActions customerId={customer.id} name={name} memberNumber={customer.member_number} />
                  )}
                  {canMergeCustomers(employee.role) && (
                    <MergeCustomerDialog customerId={customer.id} name={name} memberNumber={customer.member_number} />
                  )}
                </div>
              </Card>
            )}
        </div>

        <aside className="flex flex-col gap-3">
          <MemberCard
            name={name}
            memberNumber={customer.member_number}
            tier={{ key: tierView.current.key, label: tierView.current.label }}
            className="mx-auto max-w-sm lg:max-w-none"
          />
          {!isMerged && (
            <Link href={`/staff/print/card/${customer.id}`} className={buttonVariants({ variant: "secondary" })}>
              <Printer aria-hidden /> Print this card
            </Link>
          )}
          <Card className="mt-3 p-5">
            <h2 className="text-base font-bold text-brand-navy-deep">Gift cards</h2>
            {giftCards.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">None connected to this member.</p>
            ) : (
              <ul className="mt-3 divide-y rounded-lg border">
                {giftCards.map((g) => (
                  <li key={g.id}>
                    <Link href={`/staff/gift-cards/${g.id}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm hover:bg-muted/50">
                      <span className="font-mono font-semibold">{g.code}</span>
                      <span className="font-bold tabular-nums">{g.active ? formatCents(g.balanceCents) : "Off"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-[15px]">{children}</dd>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="mb-6 flex items-center gap-2 rounded-xl border border-success/30 bg-success/8 px-5 py-3.5 text-sm font-medium text-success"
    >
      <CheckCircle2 aria-hidden className="size-4" /> {children}
    </div>
  );
}
