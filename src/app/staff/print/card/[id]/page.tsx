import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MemberCard } from "@/components/customers/member-card";
import { buttonVariants } from "@/components/ui/button";
import { requireEmployee } from "@/server/auth";
import { getCustomer } from "@/server/customers";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Print member card" };

/**
 * Print view for one member card at real card size (85.6 × 54 mm, CR80).
 * Works with a card printer, or on paper (cut along the card edge).
 */
export default async function PrintCardPage({ params }: PageProps<"/staff/print/card/[id]">) {
  await requireEmployee();
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer || customer.merged_into_id) notFound();

  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-8 bg-muted px-4 py-10 print:block print:min-h-0 print:bg-white print:p-0">
      <style>{`@page { size: 85.6mm 54mm; margin: 0; }`}</style>

      <div className="flex w-full max-w-md flex-col gap-1 text-center print:hidden">
        <h1 className="text-xl font-bold text-brand-navy-deep">Member card</h1>
        <p className="text-sm text-muted-foreground">
          Prints at real card size. In the print window, turn on <strong>Background graphics</strong>.
        </p>
      </div>

      <MemberCard
        name={`${customer.first_name} ${customer.last_name}`}
        memberNumber={customer.member_number}
        className="w-[85.6mm] max-w-full origin-center sm:my-14 sm:scale-150 print:my-0 print:max-w-none print:scale-100"
      />

      <div className="flex flex-wrap justify-center gap-2 print:hidden">
        <Link href={`/staff/customers/${customer.id}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
          <ArrowLeft aria-hidden /> Back to profile
        </Link>
        <PrintButton />
      </div>
    </main>
  );
}
