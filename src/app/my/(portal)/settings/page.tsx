import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatPhone } from "@/lib/phone";
import { getMemberAccess } from "@/server/portal";
import { NotifyForm } from "./notify-form";
import { PinSetup } from "./pin-setup";

export const metadata: Metadata = { title: "Settings" };

export default async function MemberSettingsPage() {
  const access = await getMemberAccess();
  if (access.status !== "member") redirect("/my/login");
  const { data } = access;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight text-brand-navy-deep">Settings</h1>

      <Card className="p-5 sm:p-6">
        <PinSetup hasPin={data.hasPin} />
      </Card>

      <Card className="p-5 sm:p-6">
        <NotifyForm initial={data.notifyPrefs} />
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-base font-bold text-brand-navy-deep">Your details</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Detail label="Name">
            {data.firstName} {data.lastName}
          </Detail>
          <Detail label="Member number">
            <span className="font-mono font-semibold">{data.memberNumber}</span>
          </Detail>
          <Detail label="Email">
            <span className="break-all">{data.email ?? "—"}</span>
          </Detail>
          <Detail label="Mobile phone">{data.mobile ? formatPhone(data.mobile) : "—"}</Detail>
          <Detail label="Home store">{data.homeStore ?? "—"}</Detail>
        </dl>
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-muted/70 px-4 py-3 text-sm text-muted-foreground">
          <Store aria-hidden className="mt-0.5 size-4 shrink-0" />
          To change your name, email or phone number, please ask a team member in any store.
        </p>
      </Card>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-[15px]">{children}</dd>
    </div>
  );
}
