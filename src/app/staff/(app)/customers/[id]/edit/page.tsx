import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { formatPhone } from "@/lib/phone";
import { requireEmployee } from "@/server/auth";
import { getCustomer } from "@/server/customers";
import { getMyActiveStores } from "@/server/store-context";
import { CustomerForm } from "../../customer-form";

export const metadata: Metadata = { title: "Edit customer" };

export default async function EditCustomerPage({ params }: PageProps<"/staff/customers/[id]/edit">) {
  await requireEmployee();
  const { id } = await params;
  const [customer, myStores] = await Promise.all([getCustomer(id), getMyActiveStores()]);
  if (!customer) notFound();
  if (customer.merged_into_id) redirect(`/staff/customers/${id}`);

  // Always offer the customer's current home store, even if this employee isn't assigned to it.
  const stores = myStores.map((s) => ({ id: s.id, name: s.name }));
  if (!stores.some((s) => s.id === customer.home_location_id)) {
    stores.unshift({ id: customer.home_location_id, name: customer.homeStoreName });
  }

  return (
    <div className="w-full max-w-3xl">
      <Link
        href={`/staff/customers/${id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" /> {customer.first_name} {customer.last_name}
      </Link>
      <PageHeader
        title="Edit customer"
        description={`Member ${customer.member_number}. Every change is saved in the audit log.`}
      />
      <CustomerForm
        mode="edit"
        customerId={customer.id}
        cancelHref={`/staff/customers/${id}`}
        stores={stores}
        initial={{
          firstName: customer.first_name,
          lastName: customer.last_name,
          mobile: formatPhone(customer.mobile_phone),
          noMobile: customer.no_mobile,
          email: customer.email ?? "",
          inStoreOnly: customer.no_mobile && !customer.email,
          homeLocationId: customer.home_location_id,
          isUnder13: customer.is_under_13,
        }}
      />
    </div>
  );
}
