import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatBusinessDate, formatCalendarDate, formatCents, formatMonthYear } from "@/lib/format";
import type { RuleSetView, RulesOverview } from "@/server/tiers";

function summary(version: RuleSetView): string {
  const { rules, tiers } = version;
  const levels = tiers
    .filter((t) => t.key !== "base")
    .map((t) => `${t.name} ${formatCents(t.thresholdCents)}`)
    .join(" · ");
  const visits = rules.visitValueCents > 0 ? `visits worth ${formatCents(rules.visitValueCents)}` : "visits don't count";
  const lookback = rules.lookbackMonths === 1 ? "last month" : `${rules.lookbackMonths} months (${rules.method === "average" ? "average" : "every month"})`;
  return `${levels} · ${visits} · ${lookback}${rules.carryOver ? " · carry-over" : ""}`;
}

/** Every saved version of the rules, newest first, with when it starts and who saved it. */
export function VersionHistory({
  overview,
  savedBy,
}: {
  overview: RulesOverview;
  /** Employee id → name. */
  savedBy: Map<string, string>;
}) {
  const statusOf = (version: RuleSetView) => {
    if (version.id === overview.current.id) return { label: "In use this month", variant: "success" as const };
    if (version.id === overview.next.id) {
      return { label: `Starts ${formatCalendarDate(version.effectiveFromMonth)}`, variant: "accent" as const };
    }
    if (version.effectiveFromMonth > overview.month) return { label: "Replaced before it started", variant: "outline" as const };
    return { label: "Earlier version", variant: "outline" as const };
  };

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-brand-blue">
          <History aria-hidden className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-bold text-brand-navy-deep">Version history</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every change is kept. Each monthly tier is decided with the version that was in use that month.
          </p>
        </div>
      </div>
      <ol className="flex flex-col divide-y">
        {overview.history.map((version) => {
          const status = statusOf(version);
          const who = version.createdBy ? (savedBy.get(version.createdBy) ?? "A team member") : "Launch defaults";
          return (
            <li key={version.id} className="py-3.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-[15px] font-semibold">Version {version.version}</span>
                <Badge variant={status.variant}>{status.label}</Badge>
                <span className="text-sm text-muted-foreground">
                  from {formatMonthYear(version.effectiveFromMonth)} · saved by {who} on {formatBusinessDate(version.createdAt)}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{summary(version)}</p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
