import { CalendarClock, Info, Sparkles, Trophy } from "lucide-react";
import { TierBadge } from "@/components/tier-badge";
import { TierProgress } from "@/components/tier-progress";
import { Card } from "@/components/ui/card";
import { formatCents, formatMonthYear } from "@/lib/format";
import type { Blocker } from "@/lib/tier/engine";
import type { PortalData } from "@/server/portal";

const BLOCKER_TEXT: Record<Blocker, string> = { purchase: "a purchase", visit: "a store visit" };

/** The member's tier, what they're on track for, and how to move up. Friendly wording, no jargon. */
export function TierSummary({ data }: { data: PortalData }) {
  const { projection, names } = data;
  const { progress } = projection;
  const ratio = progress.targetCents ? progress.scoreCents / progress.targetCents : 0;
  const next = progress.nextTier;
  const trackedTier = projection.tier;
  const upNextMonth = trackedTier !== data.tier.key;

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid gap-px bg-border sm:grid-cols-2">
        <div className="bg-white p-5 sm:p-6">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Your tier now</p>
          <div className="mt-2.5">
            <TierBadge tier={data.tier.key} label={data.tier.label} className="px-4 py-1.5 text-sm" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Valid for {formatMonthYear(data.month)}.{" "}
            {data.tier.source === "override"
              ? "Set for you by the store team."
              : data.tier.decidedFrom
                ? `Earned from your ${formatMonthYear(data.tier.decidedFrom)} activity.`
                : "Everyone starts here. Your tier is updated on the 1st of each month."}
          </p>
        </div>
        <div className="bg-white p-5 sm:p-6">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            On track for {formatMonthYear(projection.forMonth)}
          </p>
          <div className="mt-2.5">
            <TierBadge tier={trackedTier} label={projection.label} className="px-4 py-1.5 text-sm" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {upNextMonth && trackedTier !== "base"
              ? "If the month ended today, you'd move up."
              : "What you'd get if the month ended today."}
          </p>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {next ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[15px] font-semibold">
                {formatCents(Math.max(0, progress.scoreCents))} of {formatCents(progress.targetCents ?? 0)} points
              </p>
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                toward <TierBadge tier={next} label={names[next]} />
              </span>
            </div>
            <TierProgress value={ratio} label={`Progress toward ${names[next]}`} className="mt-3 h-4" />

            <ul className="mt-4 flex flex-col gap-2 text-sm">
              {progress.blockedByEarlierMonths ? (
                <li className="flex items-start gap-2 text-muted-foreground">
                  <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                  An earlier month was too low to reach {names[next]} this time. Keep going — it counts again soon.
                </li>
              ) : progress.missingCents !== null && progress.missingCents > 0 ? (
                <li className="flex items-start gap-2">
                  <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-blue" />
                  <span>
                    Spend <strong>{formatCents(progress.missingCents)}</strong> more this month
                    {progress.extraVisits !== null && progress.extraVisits > 0
                      ? `, or visit ${progress.extraVisits} more ${progress.extraVisits === 1 ? "day" : "days"},`
                      : ""}{" "}
                    to reach {names[next]}.
                  </span>
                </li>
              ) : null}
              {progress.blockers.length > 0 && (
                <li className="flex items-start gap-2 text-amber-800">
                  <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>
                    To qualify this month you still need {progress.blockers.map((b) => BLOCKER_TEXT[b]).join(" and ")}.
                  </span>
                </li>
              )}
            </ul>
          </>
        ) : (
          <p className="flex items-center gap-2.5 rounded-xl bg-secondary/70 px-4 py-3.5 text-[15px] font-semibold">
            <Trophy aria-hidden className="size-5 text-brand-blue" />
            You&apos;re at the top tier. Thank you for being a loyal collector!
          </p>
        )}

        <dl className="mt-5 grid grid-cols-3 gap-3 border-t pt-4">
          <Stat label="Spent this month" value={formatCents(projection.thisMonth.spendCents)} />
          <Stat label="Visit days" value={String(projection.thisMonth.visits)} />
          <Stat label="Points" value={formatCents(projection.thisMonth.pointsCents)} />
        </dl>
        {projection.rules.visitValueCents > 0 && (
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <CalendarClock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            Points are what you spend plus {formatCents(projection.rules.visitValueCents)} for each day you visit.
          </p>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase sm:text-xs">{label}</dt>
      <dd className="mt-1 text-lg font-bold tabular-nums sm:text-xl">{value}</dd>
    </div>
  );
}
