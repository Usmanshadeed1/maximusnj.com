import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, ImageIcon, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatBusinessDateTime, formatCalendarDate } from "@/lib/format";
import { canCreateRaffles } from "@/lib/permissions";
import { PHASE_INFO, describeChannels } from "@/lib/raffles";
import { requireEmployee } from "@/server/auth";
import { getRelease } from "@/server/raffles";
import { EditReleaseDialog } from "../raffle-forms";

export const metadata: Metadata = { title: "Release" };

export default async function ReleasePage({ params, searchParams }: PageProps<"/staff/raffles/[releaseId]">) {
  const employee = await requireEmployee();
  const [{ releaseId }, flags] = await Promise.all([params, searchParams]);
  const data = await getRelease(releaseId, employee.role);
  if (!data) notFound();
  const { release, raffles } = data;
  const canCreate = canCreateRaffles(employee.role);
  const active = raffles.filter((r) => r.status !== "cancelled");
  const canAddMore = canCreate && !raffles.some((r) => r.scope === "company" && r.status !== "cancelled");

  return (
    <div className="w-full max-w-4xl">
      <Link href="/staff/raffles" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> Raffles
      </Link>

      {(flags.created === "1" || flags.added === "1") && (
        <div role="status" className="mb-5 flex items-start gap-2 rounded-xl border border-success/30 bg-success/8 px-5 py-3.5 text-sm font-medium text-success">
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {flags.created === "1" ? "Release created" : "Raffle added"} as a draft. Open a raffle below when you&apos;re ready for members to see it.
          </span>
        </div>
      )}

      {flags.products === "failed" && (
        <div role="alert" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3.5 text-sm font-medium text-amber-900">
          The raffle was created, but its products could not be saved. Open the raffle and press Change products.
        </div>
      )}

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-4">
            {release.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- staff paste any web address, so it can't use the optimized image loader
              <img src={release.image_url} alt="" className="size-20 shrink-0 rounded-lg border object-cover" />
            ) : (
              <span className="grid size-20 shrink-0 place-items-center rounded-lg bg-secondary text-brand-blue">
                <ImageIcon aria-hidden className="size-8" />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-brand-navy-deep">{release.name}</h1>
              {release.release_date && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CalendarDays aria-hidden className="size-4" /> Releases {formatCalendarDate(release.release_date)}
                </p>
              )}
              {release.description && <p className="mt-2 text-[15px] whitespace-pre-line text-muted-foreground">{release.description}</p>}
            </div>
          </div>
          {canCreate && (
            <div className="shrink-0">
              <EditReleaseDialog
                releaseId={release.id}
                initial={{
                  name: release.name,
                  description: release.description ?? "",
                  imageUrl: release.image_url ?? "",
                  releaseDate: release.release_date ?? "",
                }}
              />
            </div>
          )}
        </div>
      </Card>

      <div className="mt-6 mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-brand-navy-deep">Raffles ({active.length})</h2>
        {canAddMore && (
          <Link href={`/staff/raffles/${release.id}/new`} className={buttonVariants({ variant: "outline" })}>
            <Plus aria-hidden /> Add a store
          </Link>
        )}
      </div>

      {raffles.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">This release has no raffles yet.</Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {raffles.map((raffle) => (
            <li key={raffle.id}>
              <Link
                href={`/staff/raffles/${release.id}/${raffle.id}`}
                className="block h-full rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(11,31,58,0.04)] transition hover:border-brand-blue/50 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-bold text-brand-navy-deep">{raffle.storeName}</p>
                  <Badge variant={PHASE_INFO[raffle.phase].variant}>{PHASE_INFO[raffle.phase].label}</Badge>
                </div>
                <dl className="mt-3 grid gap-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Winners</dt>
                    <dd className="font-semibold tabular-nums">{raffle.winner_count}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Opens</dt>
                    <dd className="text-right font-medium">{formatBusinessDateTime(raffle.opens_at)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Closes</dt>
                    <dd className="text-right font-medium">{formatBusinessDateTime(raffle.closes_at)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Notify by</dt>
                    <dd className="text-right font-medium">{describeChannels(raffle.allowed_channels)}</dd>
                  </div>
                  {raffle.entryCount !== null && (
                    <div className="flex justify-between gap-3 border-t pt-2">
                      <dt className="text-muted-foreground">Entries</dt>
                      <dd className="font-bold tabular-nums">{raffle.entryCount}</dd>
                    </div>
                  )}
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
