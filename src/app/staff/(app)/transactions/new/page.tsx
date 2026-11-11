import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Receipt, Search, UserPlus } from "lucide-react";
import { CustomerList } from "@/components/customers/customer-list";
import { TierBadge } from "@/components/tier-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { formatBusinessDate, formatCents } from "@/lib/format";
import { allowedTransactionTypes, canBackdateAnyMonth } from "@/lib/permissions";
import { nyDateString, nyMonthStartString, nyTimeString } from "@/lib/timezone";
import { requireEmployee } from "@/server/auth";
import { getCustomer, getRecentCustomers, getStoreNameMap, searchCustomers } from "@/server/customers";
import { getMyActiveStores, getSelectedStore } from "@/server/store-context";
import { getCurrentTier } from "@/server/tiers";
import { getRefundablePurchases, getSpend } from "@/server/transactions";
import { CustomerSearch } from "../../customers/customer-search";
import { TransactionForm } from "./transaction-form";

export const metadata: Metadata = { title: "Record transaction" };

const PAGE = "/staff/transactions/new";

export default async function NewTransactionPage({ searchParams }: PageProps<"/staff/transactions/new">) {
  const employee = await requireEmployee();
  const { customer: customerId, q, open } = await searchParams;

  // Step 2: a member is chosen — show the form.
  if (typeof customerId === "string" && customerId) {
    const customer = await getCustomer(customerId);
    if (!customer) notFound();

    const name = `${customer.first_name} ${customer.last_name}`;
    if (customer.merged_into_id || customer.status !== "active") {
      return (
        <div className="w-full max-w-3xl">
          <Back href={PAGE} label="Choose a different member" />
          <PageHeader title="Record transaction" />
          <Card className="p-6 text-sm">
            <p className="font-semibold">
              {customer.merged_into_id ? "This record was merged into another member." : `${name} is inactive.`}
            </p>
            <p className="mt-1 text-muted-foreground">
              {customer.merged_into_id
                ? "Record the transaction on the surviving member instead."
                : "Inactive members can't have new transactions. An Owner or Manager can reactivate them from their profile."}
            </p>
            <Link href={`/staff/customers/${customer.id}`} className={buttonVariants({ variant: "outline", className: "mt-4" })}>
              Open profile
            </Link>
          </Card>
        </div>
      );
    }

    const [spend, refunds, stores, selected, tier] = await Promise.all([
      getSpend(customer.id),
      getRefundablePurchases(customer.id),
      getMyActiveStores(),
      getSelectedStore(),
      getCurrentTier(customer.id),
    ]);
    const now = new Date();

    return (
      <div className="w-full max-w-3xl">
        <Back href={PAGE} label="Choose a different member" />
        <PageHeader title="Record transaction" description="Enter the amount, then pick what happened." />

        <Card className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-5">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-brand-navy-deep">{name}</p>
            <p className="mt-0.5 font-mono text-sm font-semibold tracking-wider text-brand-blue">{customer.member_number}</p>
            <div className="mt-2">
              <TierBadge tier={tier.key} label={tier.label} />
            </div>
          </div>
          <dl className="flex gap-6 text-right">
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">This month</dt>
              <dd className="text-xl font-bold">{formatCents(spend.thisMonthCents)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Lifetime</dt>
              <dd className="text-xl font-bold">{formatCents(spend.lifetimeCents)}</dd>
            </div>
          </dl>
        </Card>

        <TransactionForm
          customerId={customer.id}
          stores={stores.map((s) => ({ id: s.id, name: s.name }))}
          defaultStoreId={selected?.id ?? stores[0]?.id ?? ""}
          allowedTypes={allowedTransactionTypes(employee.role)}
          refunds={refunds.map((r) => ({
            purchaseId: r.purchaseId,
            totalCents: r.totalCents,
            remainingCents: r.remainingCents,
            label: `${formatBusinessDate(r.purchaseAt)} · ${r.storeName}`,
          }))}
          dateLimits={{
            today: nyDateString(now),
            monthStart: canBackdateAnyMonth(employee.role) ? null : nyMonthStartString(now),
            nowTime: nyTimeString(now),
          }}
          cancelHref={`/staff/customers/${customer.id}`}
        />
      </div>
    );
  }

  // Step 1: choose the member (search by name, phone, email or number — or scan the card).
  const query = typeof q === "string" ? q.trim() : "";
  const [customers, storeNames] = await Promise.all([
    query ? searchCustomers(query) : getRecentCustomers(),
    getStoreNameMap(),
  ]);

  const exact =
    query && open === "1"
      ? customers.find((c) => c.member_number.toUpperCase() === query.toUpperCase())
      : undefined;
  if (exact) redirect(`${PAGE}?customer=${exact.id}`);

  return (
    <>
      <PageHeader title="Record transaction" description="Who is this for? Search by name, phone, email or member number." />
      <CustomerSearch initialQuery={query} basePath={PAGE} />

      <Card className="overflow-hidden">
        <div className="border-b px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold">
            {query ? (
              <>
                {customers.length} {customers.length === 1 ? "match" : "matches"} for “{query}”
              </>
            ) : (
              "Recently registered"
            )}
          </h2>
        </div>
        {customers.length > 0 ? (
          <CustomerList customers={customers} storeNames={storeNames} hrefFor={(c) => `${PAGE}?customer=${c.id}`} />
        ) : query ? (
          <EmptyState
            icon={Search}
            title="No customers match"
            description="Check the spelling or try their phone number. New to Maximus? Register them first."
            action={
              <Link href="/staff/customers/new" className={buttonVariants({})}>
                <UserPlus aria-hidden /> Register customer
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={Receipt}
            title="No customers yet"
            description="Register a member first, then you can record their purchases here."
            action={
              <Link href="/staff/customers/new" className={buttonVariants({})}>
                <UserPlus aria-hidden /> Register customer
              </Link>
            }
          />
        )}
      </Card>
    </>
  );
}

function Back({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-4" /> {label}
    </Link>
  );
}
