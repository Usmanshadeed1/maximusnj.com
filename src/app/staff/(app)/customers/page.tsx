import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IdCard, Search, UserPlus } from "lucide-react";
import { CustomerList } from "@/components/customers/customer-list";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { requireEmployee } from "@/server/auth";
import { getRecentCustomers, getStoreNameMap, searchCustomers } from "@/server/customers";
import { CustomerSearch } from "./customer-search";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: PageProps<"/staff/customers">) {
  await requireEmployee();
  const { q, open } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  const [customers, storeNames] = await Promise.all([
    query ? searchCustomers(query) : getRecentCustomers(),
    getStoreNameMap(),
  ]);

  // Pressing Enter (what a barcode scanner does) on an exact member number opens that profile.
  // While typing, results only filter — so typing a full number never jumps to the wrong person.
  const exact =
    query && open === "1"
      ? customers.find((c) => c.member_number.toUpperCase() === query.toUpperCase())
      : undefined;
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

      <CustomerSearch initialQuery={query} />

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
