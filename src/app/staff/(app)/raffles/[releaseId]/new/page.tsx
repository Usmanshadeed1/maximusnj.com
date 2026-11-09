import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { requireEmployee } from "@/server/auth";
import { getProducts } from "@/server/products";
import { getRelease, getStoresForRaffles } from "@/server/raffles";
import { newRaffleDefaults } from "../../defaults";
import { AddRafflesForm } from "../../raffle-forms";

export const metadata: Metadata = { title: "Add raffle" };

export default async function AddRafflePage({ params }: PageProps<"/staff/raffles/[releaseId]/new">) {
  const employee = await requireEmployee(["owner", "manager"]);
  const { releaseId } = await params;
  const [release, stores] = await Promise.all([getRelease(releaseId, employee.role), getStoresForRaffles()]);
  if (!release) notFound();

  // A store can only have one raffle per release, so only offer stores that don't have one yet.
  const taken = new Set(release.raffles.filter((r) => r.status !== "cancelled" && r.location_id).map((r) => r.location_id));
  const hasCompany = release.raffles.some((r) => r.scope === "company" && r.status !== "cancelled");
  const hasAny = release.raffles.some((r) => r.status !== "cancelled");
  const available = stores.filter((s) => !taken.has(s.id));
  const products = (await getProducts()).map((p) => ({ id: p.id, name: p.name, description: p.description, imageUrl: p.image_url }));

  return (
    <div className="w-full max-w-3xl">
      <Link href={`/staff/raffles/${releaseId}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> {release.release.name}
      </Link>
      <PageHeader title="Add a raffle" description={`For ${release.release.name}`} />
      {hasCompany || (available.length === 0 && hasAny) ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          {hasCompany
            ? "This release has one raffle for all stores, so nothing more can be added."
            : "Every store you can manage already has a raffle for this release."}
        </p>
      ) : (
        <AddRafflesForm
          releaseId={releaseId}
          stores={available}
          // A company-wide raffle is only possible when the release has no other raffles yet.
          canCompany={employee.role === "owner" && !hasAny}
          initial={newRaffleDefaults()}
          products={products}
        />
      )}
    </div>
  );
}
