import type { Metadata } from "next";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Wrench } from "lucide-react";
import { RecalculateDialog } from "@/components/tiers/recalculate-dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatBusinessDateTime, formatCalendarDate, formatMonthYear } from "@/lib/format";
import type { TierKey } from "@/lib/tier/engine";
import { friendlyRunError } from "@/lib/tier/run-messages";
import { addMonths } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { requireEmployee } from "@/server/auth";
import { type RunView, getRolloverOverview } from "@/server/tier-awards";
import { getTierLabels } from "@/server/tiers";
import { RunNowPanel } from "./run-now-panel";

export const metadata: Metadata = { title: "Monthly update" };

const SOURCE_LABEL = { scheduled: "Automatic", manual: "By hand", test: "Test" } as const;

export default async function MonthlyUpdatePage() {
  await requireEmployee(["owner"]);
  const [overview, names] = await Promise.all([getRolloverOverview(), getTierLabels()]);

  const monthLabel = formatMonthYear(overview.month);
  const nextLabel = formatMonthYear(overview.nextMonth);
  const state = overview.state;

  const recalcOptions = [
    ...(overview.testToolsEnabled ? [{ value: overview.nextMonth, label: `${nextLabel} (next month, test)` }] : []),
    ...Array.from({ length: 12 }, (_, i) => {
      const value = addMonths(overview.month, -i);
      return { value, label: `${formatMonthYear(value)}${i === 0 ? " (this month)" : ""}` };
    }),
  ];

  return (
    <div className="w-full max-w-4xl">
      <PageHeader
        title="Monthly tier update"
        description="Tiers are decided automatically on the 1st of each month."
      />

      <div className="flex flex-col gap-5">
        {/* Status */}
        <Card
          className={cn(
            "border-2 p-5 sm:p-6",
            state.kind === "done" && "border-success/40",
            state.kind === "failed" && "border-destructive/50 bg-destructive/5",
            state.kind === "pending" && "border-amber-400 bg-amber-50/60",
          )}
        >
          <div className="flex items-start gap-4">
            <span
              className={cn(
                "grid size-12 shrink-0 place-items-center rounded-full",
                state.kind === "done" && "bg-success/15 text-success",
                state.kind === "failed" && "bg-destructive/15 text-destructive",
                state.kind === "pending" && "bg-amber-200/70 text-amber-800",
              )}
            >
              {state.kind === "done" ? (
                <CheckCircle2 aria-hidden className="size-7" />
              ) : state.kind === "failed" ? (
                <AlertTriangle aria-hidden className="size-7" />
              ) : (
                <Clock aria-hidden className="size-7" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-brand-navy-deep">
                {state.kind === "done" && "Everything is working"}
                {state.kind === "failed" && "The update didn't finish"}
                {state.kind === "pending" && `${monthLabel}'s update hasn't run yet`}
              </h2>
              <p className="mt-1.5 text-base">
                {state.kind === "done" &&
                  `${monthLabel} tiers were decided on ${formatBusinessDateTime(state.run.startedAt)} (New York time) for ${state.run.processed} ${state.run.processed === 1 ? "member" : "members"}.`}
                {state.kind === "failed" && (
                  <>
                    Problem: <strong>{friendlyRunError(state.run.error)}</strong> Nothing was half-saved. The app
                    tries again by itself every hour.
                  </>
                )}
                {state.kind === "pending" &&
                  "It runs by itself shortly after midnight on the 1st. If it still hasn't run an hour later, press the button below."}
              </p>
              <p className="mt-2 flex items-center gap-2 text-[15px] text-muted-foreground">
                <CalendarClock aria-hidden className="size-4 shrink-0" />
                Next automatic update: {formatCalendarDate(overview.nextMonth)} at 12:05 AM, New York time.
              </p>

              <div className="mt-5">
                <RunNowPanel
                  label={state.kind === "done" ? "Check again now" : "Run the update now"}
                  emphasise={state.kind !== "done"}
                />
                {state.kind === "done" && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Safe to press: anyone who already has their tier is left alone.
                  </p>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Recent updates */}
        <Card className="p-5 sm:p-6">
          <h2 className="mb-1 text-base font-bold text-brand-navy-deep">Recent updates</h2>
          <p className="mb-4 text-[15px] text-muted-foreground">The last updates, newest first.</p>
          {overview.runs.length === 0 ? (
            <p className="rounded-lg bg-muted/60 px-4 py-4 text-[15px] text-muted-foreground">
              Nothing has run yet. The first update happens within the hour.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {overview.runs.map((run) => (
                <RunRow key={run.id} run={run} names={names} />
              ))}
            </ul>
          )}
        </Card>

        {/* Fix a finished month */}
        <Card className="p-5 sm:p-6">
          <div className="mb-3 flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-brand-blue">
              <Wrench aria-hidden className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-brand-navy-deep">Need to fix a finished month?</h2>
              <p className="mt-0.5 text-[15px] text-muted-foreground">
                If a sale or refund was changed after a month ended, you can decide that month again for everyone. The
                old results are kept in each member&apos;s history, and you write down why.
              </p>
            </div>
          </div>
          <RecalculateDialog
            monthOptions={recalcOptions}
            title="Recalculate everyone"
            description="Decide a finished month again for every member."
            buttonLabel="Recalculate everyone…"
            variant="secondary"
          />
        </Card>
      </div>
    </div>
  );
}

function RunRow({ run, names }: { run: RunView; names: Record<TierKey, string> }) {
  const summary = run.summary
    ? (["base", "silver", "gold", "diamond"] as const)
        .filter((key) => run.summary?.[key])
        .map((key) => `${names[key]} ${run.summary?.[key]}`)
        .join(" · ")
    : "";

  return (
    <li className="flex flex-col gap-1.5 py-3.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[15px] font-semibold">{formatMonthYear(run.awardedMonth)}</span>
        <Badge variant={run.source === "test" ? "accent" : "secondary"}>{SOURCE_LABEL[run.source]}</Badge>
        <Badge variant={run.status === "succeeded" ? "success" : run.status === "failed" ? "destructive" : "outline"}>
          {run.status === "succeeded" ? "Done" : run.status === "failed" ? "Didn't finish" : "Running"}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {formatBusinessDateTime(run.startedAt)}
        {run.startedByName ? ` · started by ${run.startedByName}` : ""}
        {run.status === "succeeded"
          ? ` · ${run.processed} decided${run.skipped > 0 ? `, ${run.skipped} already had a tier` : ""}${summary ? ` (${summary})` : ""}`
          : ""}
      </p>
      {run.status === "failed" && <p className="text-sm font-medium text-destructive">{friendlyRunError(run.error)}</p>}
    </li>
  );
}

