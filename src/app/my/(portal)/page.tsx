import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Gift, PartyPopper, ShieldAlert } from "lucide-react";
import { ActivityList, PortalMemberCard, mergeActivity } from "@/components/portal/portal-parts";
import { TierSummary } from "@/components/portal/tier-summary";
import { Card } from "@/components/ui/card";
import { getMemberAccess } from "@/server/portal";

export const metadata: Metadata = { title: "My membership" };

export default async function MemberHomePage({ searchParams }: PageProps<"/my">) {
  const [access, flags] = await Promise.all([getMemberAccess(), searchParams]);
  if (access.status !== "member") redirect("/my/login");
  const { data } = access;
  const recent = mergeActivity(data).slice(0, 5);

  return (
    <div className="flex flex-col gap-5">
      {flags.welcome === "1" && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success/8 p-4 text-success">
          <PartyPopper aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Welcome to the club, {data.firstName}!</p>
            <p className="mt-0.5 text-sm text-success/90">
              Your member number is <span className="font-mono font-bold">{data.memberNumber}</span>. Ask for your card
              at any store.
            </p>
          </div>
        </div>
      )}

      {!data.active && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm">
            <strong>Your membership is paused.</strong> Please visit a store and we&apos;ll help you.
          </p>
        </div>
      )}

      <PortalMemberCard data={data} />

      <TierSummary data={data} />

      {data.tier.benefits && (
        <Card className="p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-brand-navy-deep">
            <Gift aria-hidden className="size-5 text-brand-blue" /> Your {data.tier.label} benefits
          </h2>
          <p className="mt-2.5 text-[15px] leading-relaxed whitespace-pre-line text-muted-foreground">{data.tier.benefits}</p>
        </Card>
      )}

      {!data.hasPin && (
        <Link
          href="/my/settings#pin"
          className="group flex items-center gap-3 rounded-2xl border border-brand-yellow/60 bg-brand-yellow/15 p-4 transition-colors hover:bg-brand-yellow/25"
        >
          <ShieldAlert aria-hidden className="size-6 shrink-0 text-brand-navy-deep" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-brand-navy-deep">Protect your card with a PIN</p>
            <p className="text-sm text-muted-foreground">Takes a few seconds. Then nobody else can check in with your card.</p>
          </div>
          <ArrowRight aria-hidden className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      <Card className="p-5 sm:p-6">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-brand-navy-deep">Recent activity</h2>
          <Link href="/my/history" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline">
            See all <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        <ActivityList items={recent} empty="Your visits and purchases will show up here." />
      </Card>
    </div>
  );
}
