import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IdCard, Search, UserPlus, X } from "lucide-react";
import { CustomerList } from "@/components/customers/customer-list";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { requireEmployee } from "@/server/auth";
import { getRecentCustomers, getStoreNameMap, searchCustomers } from "@/server/customers";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: PageProps<"/staff/customers">) {
  await requireEmployee();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  const [customers, storeNames] = await Promise.all([
    query ? searchCustomers(query) : getRecentCustomers(),
    getStoreNameMap(),
  ]);

  // Scanning a card types the exact member number: open that profile straight away.
  const exact = query ? customers.find((c) => c.member_number.toUpperCase() === query.toUpperCase()) : undefined;
  if (exact) redirect(`/staff/customers/${exact.id}`);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Find a member by name, phone, email or member number — or scan their card."
        actions={
          <Link href="/staff/customers/new" className={buttonVariants({ size: "lg" })}>
            <UserPlus aria-hidden /> Register customer
          </Link>
        }
      />

      <form action="/staff/customers" role="search" className="mb-5 flex gap-2">
        <label htmlFor="q" className="sr-only">
          Search customers
        </label>
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            autoFocus
            autoComplete="off"
            placeholder="Name, phone, email or member number"
            className="h-12 w-full rounded-lg border border-input bg-white pr-10 pl-11 text-base shadow-xs transition-[border-color,box-shadow] placeholder:text-muted-foreground hover:border-brand-navy/60 focus-visible:border-brand-blue focus-visible:ring-4 focus-visible:ring-brand-blue/20 focus-visible:outline-none"
          />
          {query && (
            <Link
              href="/staff/customers"
              aria-label="Clear search"
              className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </Link>
          )}
        </div>
        <button type="submit" className={buttonVariants({ size: "lg", variant: "secondary", className: "h-12" })}>
          Search
        </button>
      </form>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
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
          <CustomerList customers={customers} storeNames={storeNames} />
        ) : query ? (
          <EmptyState
            icon={Search}
            title="No customers match"
            description="Check the spelling or try their phone number. New to Maximus? Register them as a member."
            action={
              <Link href="/staff/customers/new" className={buttonVariants({})}>
                <UserPlus aria-hidden /> Register customer
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={IdCard}
            title="No customers yet"
            description="Register your first member to issue their MAX member number and card."
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
