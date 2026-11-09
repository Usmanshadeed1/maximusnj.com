import { CalendarDays, Info } from "lucide-react";
import { TierBadge } from "@/components/tier-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RecalculateDialog } from "@/components/tiers/recalculate-dialog";
import { formatBusinessDate, formatCents, formatMonthYear } from "@/lib/format";
import type { AwardView } from "@/server/tier-awards";

/** "November 2026" for one month, "September to November 2026" for several. */
function monthRange(months: string[]): string {
  if (months.length <= 1) return formatMonthYear(months[0] ?? "");
  return `${formatMonthYear(months[0])} to ${formatMonthYear(months[months.length - 1])}`;
}

function basedOn(award: AwardView): string {
  const months = award.months.length > 0 ? award.months.map((m) => m.month) : [award.qualifyingMonth];
  if (award.months.length <= 1) {
    const only = award.months[0];
    return `Decided from ${formatMonthYear(months[0])}: ${formatCents(only?.spendCents ?? award.netSpendCents)} spent, ${
      only?.visits ?? award.visits
    } ${(only?.visits ?? award.visits) === 1 ? "visit day" : "visit days"}.`;
  }
  const how = award.method === "average" ? "on average" : "in every month";
  return `Decided from ${monthRange(months)} (${how}): ${formatCents(award.netSpendCents)} spent, ${award.visits} visit days in total.`;
}

function sourceLabel(award: AwardView): string {
  switch (award.source) {
    case "recalculation":
      return "recalculated";
    case "test":
      return "test run";
    case "manual":
      return "run by hand";
    default:
      return "automatic";
  }
}

/**
 * Every monthly decision for this member, newest first. A result that was later replaced stays
 * visible underneath, so nothing is ever hidden or silently changed.
 */
export function MonthlyTiersCard({
  awards,
  customerId,
  customerName,
  canManage,
  monthOptions,
}: {
  awards: AwardView[];
  customerId: string;
  customerName: string;
  canManage: boolean;
  monthOptions: { value: string; label: string }[];
}) {
  // Group by the month the tier applies to.
  const groups = new Map<string, AwardView[]>();
  for (const award of awards) groups.set(award.awardedMonth, [...(groups.get(award.awardedMonth) ?? []), award]);

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-brand-navy-deep">Monthly tiers</h2>
          <p className="mt-0.5 text-[15px] text-muted-foreground">
            On the 1st of each month the app decides a tier from the month before. Here is every decision.
          </p>
        </div>
        {canManage && (
          <RecalculateDialog
            monthOptions={monthOptions}
            customerId={customerId}
            title="Recalculate this member's tier"
            description={`Decide a finished month again for ${customerName}.`}
            buttonLabel="Recalculate"
          />
        )}
      </div>

      {groups.size === 0 ? (
        <div className="flex items-start gap-3 rounded-lg bg-muted/60 px-4 py-4 text-[15px] text-muted-foreground">
          <CalendarDays aria-hidden className="mt-0.5 size-5 shrink-0" />
          No monthly tier has been decided for this member yet. The first one is decided on the 1st of next month.
        </div>
      ) : (
        <ol className="flex flex-col divide-y">
          {[...groups.entries()].map(([month, versions]) => {
            const current = versions.find((v) => v.isCurrent) ?? versions[0];
            const replaced = versions.filter((v) => v.id !== current.id);
            return (
              <li key={month} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="min-w-36 text-[15px] font-semibold">{formatMonthYear(month)}</span>
                  <TierBadge tier={current.tier} label={current.label} />
                  {current.isTest && <Badge variant="accent">Test</Badge>}
                  {current.source === "recalculation" && <Badge variant="secondary">Recalculated</Badge>}
                </div>
                <p className="mt-1.5 text-[15px] text-muted-foreground">{basedOn(current)}</p>
                {!current.requirementsMet && (
                  <p className="mt-1 flex items-start gap-1.5 text-[15px] text-amber-800">
                    <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                    A requirement wasn&apos;t met that month (a purchase and/or a visit), so the tier stayed at the starting level.
                  </p>
                )}
                {current.reason && <p className="mt-1 text-[15px]">Reason: “{current.reason}”</p>}
                <p className="mt-1 text-sm text-muted-foreground">
                  {current.ruleVersion ? `Rules version ${current.ruleVersion} · ` : ""}
                  {sourceLabel(current)} · {formatBusinessDate(current.calculatedAt)}
                </p>

                {replaced.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1.5 rounded-lg bg-muted/50 px-4 py-3">
                    {replaced.map((old) => (
                      <li key={old.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                        <span>Earlier result, replaced:</span>
                        <TierBadge tier={old.tier} label={old.label} className="opacity-80" />
                        <span>
                          ({sourceLabel(old)}, {formatBusinessDate(old.calculatedAt)})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
