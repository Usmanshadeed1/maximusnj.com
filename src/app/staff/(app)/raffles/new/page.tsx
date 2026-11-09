import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { requireEmployee } from "@/server/auth";
import { getStoresForRaffles } from "@/server/raffles";
import { newRaffleDefaults } from "../defaults";
import { NewReleaseForm } from "../raffle-forms";

export const metadata: Metadata = { title: "New release" };

export default async function NewReleasePage() {
  const employee = await requireEmployee(["owner", "manager"]);
  const stores = await getStoresForRaffles();
  const initial = newRaffleDefaults();
  // Someone with a single store doesn't need to tick it.
  if (stores.length === 1) initial.locationIds = [stores[0].id];

  return (
    <div className="w-full max-w-3xl">
      <Link href="/staff/raffles" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> Raffles
      </Link>
      <PageHeader title="New release" description="Set up the release and its raffles. Nothing is visible to members until you open a raffle." />
      <NewReleaseForm stores={stores} canCompany={employee.role === "owner"} initial={initial} />
    </div>
  );
}
