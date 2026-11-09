import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { requireEmployee } from "@/server/auth";
import { getRaffleDetail, getStoresForRaffles } from "@/server/raffles";
import { raffleToFieldValues } from "../../../defaults";
import { EditRaffleForm } from "../../../raffle-forms";

export const metadata: Metadata = { title: "Edit raffle" };

export default async function EditRafflePage({ params }: PageProps<"/staff/raffles/[releaseId]/[raffleId]/edit">) {
  const employee = await requireEmployee(["owner", "manager"]);
  const { releaseId, raffleId } = await params;
  const [detail, stores] = await Promise.all([getRaffleDetail(releaseId, raffleId, employee.role), getStoresForRaffles()]);
  if (!detail) notFound();
  const { raffle, release } = detail;
  if (!raffle.canManage || !["draft", "upcoming", "open"].includes(raffle.phase)) redirect(`/staff/raffles/${releaseId}/${raffleId}`);

  return (
    <div className="w-full max-w-3xl">
      <Link
        href={`/staff/raffles/${releaseId}/${raffleId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" /> {release.name}
      </Link>
      <PageHeader
        title="Edit raffle"
        description={
          raffle.status === "draft"
            ? "Nothing is visible to members yet, so everything can change."
            : "This raffle is open. The store can't change, and the opening time can't move once it has opened."
        }
      />
      <EditRaffleForm
        releaseId={releaseId}
        raffleId={raffleId}
        stores={stores}
        canCompany={employee.role === "owner"}
        initial={raffleToFieldValues(raffle)}
        lockScope={raffle.status !== "draft"}
        lockOpens={raffle.phase === "open"}
      />
    </div>
  );
}
