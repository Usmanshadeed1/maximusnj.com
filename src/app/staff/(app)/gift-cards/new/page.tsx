import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireEmployee } from "@/server/auth";
import { getSelectedStore } from "@/server/store-context";
import { SellGiftCardForm } from "../gift-card-forms";

export const metadata: Metadata = { title: "Sell a gift card" };

export default async function SellGiftCardPage() {
  await requireEmployee();
  const store = await getSelectedStore();

  return (
    <div className="w-full max-w-2xl">
      <Link href="/staff/gift-cards" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> Gift cards
      </Link>
      <PageHeader title="Sell a gift card" description={store ? `Sold at ${store.name}.` : undefined} />
      <Card className="p-5 sm:p-6">
        <SellGiftCardForm />
      </Card>
    </div>
  );
}
