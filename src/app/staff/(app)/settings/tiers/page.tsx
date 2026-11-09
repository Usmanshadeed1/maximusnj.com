import type { Metadata } from "next";
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

  return (
    <div className="w-full max-w-4xl">
      <PageHeader
        title="Tier settings"
        description={`Changes you save start on ${startsOn}. ${formatMonthYear(overview.month)} keeps the current rules.`}
      />

      <div className="flex flex-col gap-5">
        <TierSettingsForm initial={ruleSetToFormValues(overview.next)} startsOn={startsOn} />
        <VersionHistory overview={overview} savedBy={savedBy} />
      </div>
    </div>
  );
}
