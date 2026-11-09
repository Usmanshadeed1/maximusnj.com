import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronRight, Plus, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { formatBusinessDateTime, formatCalendarDate } from "@/lib/format";
import { canCreateRaffles } from "@/lib/permissions";
import { PHASE_INFO } from "@/lib/raffles";
import { requireEmployee } from "@/server/auth";
import { getReleases } from "@/server/raffles";

export const metadata: Metadata = { title: "Raffles" };

export default async function RafflesPage() {
  const employee = await requireEmployee();
  const releases = await getReleases(employee.role);
  const canCreate = canCreateRaffles(employee.role);

  return (
    <>
      <PageHeader
        title="Raffles"
        description="Raffles for new releases. Members enter online or in store."
        actions={
          canCreate ? (
            <Link href="/staff/raffles/new" className={buttonVariants({ size: "lg" })}>
              <Plus aria-hidden /> New release
            </Link>
          ) : undefined
        }
      />

      {releases.length === 0 ? (
        <Card>
          <EmptyState
            icon={Ticket}
            title="No raffles yet"
            description={canCreate ? "Create a release to start a raffle for it." : "An Owner or Manager sets raffles up. They will show here."}
            action={
              canCreate ? (
                <Link href="/staff/raffles/new" className={buttonVariants()}>
                  <Plus aria-hidden /> New release
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {releases.map(({ release, raffles }) => (
            <li key={release.id}>
              <Card className="overflow-hidden">
                <Link
                  href={`/staff/raffles/${release.id}`}
                  className="flex items-center gap-3 p-5 transition-colors hover:bg-muted/50 sm:p-6"
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-bold text-brand-navy-deep">{release.name}</h2>
                    {release.release_date && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarDays aria-hidden className="size-4" /> Releases {formatCalendarDate(release.release_date)}
                      </p>
                    )}
                  </div>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                </Link>
                {raffles.length > 0 && (
                  <ul className="divide-y border-t bg-muted/30">
                    {raffles.map((raffle) => (
                      <li key={raffle.id}>
                        <Link
                          href={`/staff/raffles/${release.id}/${raffle.id}`}
                          className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5 transition-colors hover:bg-muted/60 sm:px-6"
                        >
                          <span className="min-w-0 flex-1 text-[15px] font-semibold">{raffle.storeName}</span>
                          <Badge variant={PHASE_INFO[raffle.phase].variant}>{PHASE_INFO[raffle.phase].label}</Badge>
                          <span className="text-sm text-muted-foreground">
                            Closes {formatBusinessDateTime(raffle.closes_at)}
                          </span>
                          {raffle.entryCount !== null && (
                            <span className="text-sm font-semibold tabular-nums">
                              {raffle.entryCount} {raffle.entryCount === 1 ? "entry" : "entries"}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
