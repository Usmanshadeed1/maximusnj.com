import Link from "next/link";
import { CalendarClock, Crown, Info, SlidersHorizontal, Sparkles } from "lucide-react";
import { TierBadge } from "@/components/tier-badge";
import { TierProgress } from "@/components/tier-progress";
import { Card } from "@/components/ui/card";
import { formatCalendarDate, formatCents, formatMonthYear } from "@/lib/format";
import type { Blocker } from "@/lib/tier/engine";
import type { AwardView } from "@/server/tier-awards";
import type { TierView } from "@/server/tiers";
import { ClearTierDialog, SetTierDialog } from "./tier-override-dialogs";

const BLOCKER_TEXT: Record<Blocker, string> = { purchase: "a purchase", visit: "a visit" };

/**
 * The member's tier at a glance (PROJECT_SCOPE.md §7.5):
 *  - CURRENT tier: what they hold today (fixed for the month).
 *  - PROJECTED tier: what they'd get if this month ended now.
 * The two are always labeled separately so they're never confused.
 */
export function TierCard({
  view,
  awards,
  customerId,
  customerName,
  canManage,
  monthOptions,
}: {
  view: TierView;
  awards: AwardView[];
  customerId: string;
  customerName: string;
  canManage: boolean;
  monthOptions: { value: string; label: string }[];
}) {
  const { current, projection } = view;
  const { progress, names } = projection;
  const monthStart = projection.months[projection.months.length - 1]?.month ?? "";
  const override = current.override;
  const overrideUntil = override?.lastMonth
    ? `until the end of ${formatMonthYear(override.lastMonth)}`
    : "until the Owner removes it";

  const currentAward = awards.find((a) => a.isCurrent && a.awardedMonth === monthStart);
  const nextAward = awards.find((a) => a.isCurrent && a.awardedMonth === projection.forMonth);

  const ratio = progress.targetCents ? progress.scoreCents / progress.targetCents : 0;
  const blockedTier = progress.blockers.length > 0 && progress.scoreTier !== "base" && projection.tier === "base";

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-brand-navy-deep">Tier</h2>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <SetTierDialog
              customerId={customerId}
              customerName={customerName}
              currentTier={current.key}
              labels={names}
              monthOptions={monthOptions}
              replacing={Boolean(override)}
            />
            {override && <ClearTierDialog customerId={customerId} customerName={customerName} />}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Current */}
        <div className="rounded-xl bg-secondary/60 p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Current tier</p>
          <div className="mt-2">
            <TierBadge tier={current.key} label={current.label} className="px-4 py-1.5 text-sm" />
          </div>
          <p className="mt-2.5 text-sm text-muted-foreground">
            {monthStart ? `For ${formatMonthYear(monthStart)}. ` : ""}
            {override
              ? "Set by hand."
              : currentAward
                ? `Decided from ${formatMonthYear(currentAward.qualifyingMonth)}${currentAward.isTest ? " (test run)" : ""}.`
                : "Everyone starts here. Tiers are decided automatically on the 1st of each month."}
          </p>
          {override && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-white px-3 py-2.5 text-sm ring-1 ring-brand-yellow/60">
              <Crown aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold">Set by the Owner {overrideUntil}</p>
                <p className="mt-0.5 text-muted-foreground">“{override.reason}”</p>
              </div>
            </div>
          )}
        </div>

        {/* Projected */}
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Projected for {formatMonthYear(projection.forMonth)}
          </p>
          <div className="mt-2">
            <TierBadge tier={projection.tier} label={projection.label} className="px-4 py-1.5 text-sm" />
          </div>
          <p className="mt-2.5 text-sm text-muted-foreground">
            {override
              ? "What the automatic calculation gives today. Your override above stays in effect."
              : "What they'd get if this month ended today."}
          </p>
          {nextAward && (
            <p className="mt-2 rounded-lg bg-secondary/60 px-3 py-2 text-sm font-medium">
              Already decided: {nextAward.label}{nextAward.isTest ? " (test run)" : ""}, starting {formatCalendarDate(projection.forMonth)}.
            </p>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="mt-5">
        {progress.nextTier ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="font-medium">
                {formatCents(Math.max(0, progress.scoreCents))} of {formatCents(progress.targetCents ?? 0)} points
                toward
              </p>
              <TierBadge tier={progress.nextTier} label={names[progress.nextTier]} />
            </div>
            <TierProgress
              value={ratio}
              label={`Progress toward ${names[progress.nextTier]}`}
              className="mt-2.5"
            />

            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {progress.blockedByEarlierMonths ? (
                <li className="flex items-start gap-2 text-muted-foreground">
                  <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                  An earlier month in the look-back is too low to reach {names[progress.nextTier]} this month.
                </li>
              ) : progress.missingCents !== null && progress.missingCents > 0 ? (
                <li className="flex items-start gap-2">
                  <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-blue" />
                  <span>
                    <strong>Easiest way up:</strong> spend {formatCents(progress.missingCents)} more
                    {progress.extraVisits !== null
                      ? `, or visit ${progress.extraVisits} more ${progress.extraVisits === 1 ? "day" : "days"}`
                      : ""}
                    .
                  </span>
                </li>
              ) : null}
              {progress.blockers.length > 0 && (
                <li className="flex items-start gap-2 text-amber-800">
                  <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Still needed this month: {progress.blockers.map((b) => BLOCKER_TEXT[b]).join(" and ")}.
                    {blockedTier ? ` Their points already reach ${names[progress.scoreTier]}.` : ""}
                  </span>
                </li>
              )}
            </ul>
          </>
        ) : (
          <p className="flex items-center gap-2 rounded-lg bg-secondary/60 px-4 py-3 text-sm font-medium">
            <Sparkles aria-hidden className="size-4 text-brand-blue" />
            Top tier — there&apos;s nothing higher to reach.
          </p>
        )}
      </div>

      {/* This month */}
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t pt-4 text-sm">
        <Stat label="Spent this month" value={formatCents(projection.thisMonth.spendCents)} />
        <Stat label="Visit days" value={String(projection.thisMonth.visits)} />
        <Stat label="Tier points" value={formatCents(projection.thisMonth.pointsCents)} />
      </dl>

      <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <CalendarClock aria-hidden className="size-3.5" />
        Using tier rules version {projection.ruleVersion}.
        {canManage && (
          <Link href="/staff/settings/tiers" className="inline-flex items-center gap-1 font-medium text-brand-blue hover:underline">
            <SlidersHorizontal aria-hidden className="size-3.5" /> Tier settings
          </Link>
        )}
      </p>
      <span className="sr-only">{customerName}</span>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}
