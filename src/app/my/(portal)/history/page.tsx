import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActivityList, mergeActivity } from "@/components/portal/portal-parts";
import { Card } from "@/components/ui/card";
import { getMemberAccess } from "@/server/portal";

export const metadata: Metadata = { title: "History" };

export default async function MemberHistoryPage() {
  const access = await getMemberAccess();
  if (access.status !== "member") redirect("/my/login");
  const { data } = access;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight text-brand-navy-deep">History</h1>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-1 text-base font-bold text-brand-navy-deep">Purchases and refunds</h2>
        <ActivityList
          items={mergeActivity({ ...data, visits: [] })}
          empty="No purchases yet. They appear here after you shop in a store."
        />
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-1 text-base font-bold text-brand-navy-deep">Store visits</h2>
        <ActivityList
          items={mergeActivity({ ...data, purchases: [] })}
          empty="No visits yet. Scan your card at the entrance to check in."
        />
      </Card>
      <p className="text-center text-xs text-muted-foreground">Showing your most recent activity.</p>
    </div>
  );
}
