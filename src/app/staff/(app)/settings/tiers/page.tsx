import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { formatCalendarDate, formatMonthYear } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ruleSetToFormValues } from "@/lib/tier/form-values";
import { requireEmployee } from "@/server/auth";
import { getRulesOverview } from "@/server/tiers";
import { TierSettingsForm } from "./tier-settings-form";
import { VersionHistory } from "./version-history";

export const metadata: Metadata = { title: "Tier settings" };

export default async function TierSettingsPage() {
  await requireEmployee(["owner"]);
  const overview = await getRulesOverview();

  // Who saved each version (the Owner can read every employee).
  const supabase = await createSupabaseServerClient();
  const { data: employees } = await supabase.from("employees").select("id, first_name, last_name");
  const savedBy = new Map((employees ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]));

  const startsOn = formatCalendarDate(overview.nextMonth);
  const hasPending = overview.next.id !== overview.current.id;

  return (
    <div className="w-full max-w-4xl">
      <PageHeader
        title="Tier settings"
        description="Decide how members earn Silver, Gold and Diamond. You can change any of this at any time."
      />

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-brand-blue/30 bg-secondary/50 px-4 py-3.5 text-sm">
        <CalendarClock aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-blue" />
        <div>
          <p className="font-semibold text-brand-navy-deep">Changes take effect on {startsOn}</p>
          <p className="mt-0.5 text-muted-foreground">
            {formatMonthYear(overview.month)} keeps using version {overview.current.version}, so nobody&apos;s tier changes
            part-way through the month.
            {hasPending ? ` Version ${overview.next.version} is already planned to start on ${startsOn}.` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <TierSettingsForm initial={ruleSetToFormValues(overview.next)} startsOn={startsOn} />
        <VersionHistory overview={overview} savedBy={savedBy} />
      </div>
    </div>
  );
}
