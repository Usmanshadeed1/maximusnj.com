import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { requireEmployee } from "@/server/auth";
import { getMyActiveStores, getSelectedStore } from "@/server/store-context";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "Register customer" };

export default async function NewCustomerPage() {
  await requireEmployee();
  const [stores, selected] = await Promise.all([getMyActiveStores(), getSelectedStore()]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/staff/customers"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" /> Customers
      </Link>
      <PageHeader title="Register customer" description="Takes about 30 seconds. Staff never type a member number." />
      <CustomerForm
        mode="create"
        cancelHref="/staff/customers"
        stores={stores.map((s) => ({ id: s.id, name: s.name }))}
        initial={{
          firstName: "",
          lastName: "",
          mobile: "",
          noMobile: false,
          email: "",
          inStoreOnly: false,
          homeLocationId: selected?.id ?? stores[0]?.id ?? "",
          isUnder13: false,
        }}
      />
    </div>
  );
}
