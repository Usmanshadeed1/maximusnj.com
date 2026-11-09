import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Store, UserRound } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ROLE_LABELS, canManageTiers } from "@/lib/permissions";
import { friendlyRunError } from "@/lib/tier/run-messages";
import { requireEmployee } from "@/server/auth";
import { getSelectedStore } from "@/server/store-context";
import { getRolloverFailure } from "@/server/tier-awards";

export const metadata: Metadata = { title: "Dashboard" };

export default async function StaffDashboardPage() {
  const employee = await requireEmployee();
  const [store, failedUpdate] = await Promise.all([
    getSelectedStore(),
    canManageTiers(employee.role) ? getRolloverFailure() : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader title={`Welcome, ${employee.firstName}`} description="Maximus Members staff app" />
      {failedUpdate && (
        <div
          role="alert"
          className="mb-5 flex flex-col gap-3 rounded-xl border-2 border-destructive/50 bg-destructive/5 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden className="mt-0.5 size-6 shrink-0 text-destructive" />
            <div>
              <p className="text-base font-bold text-destructive">This month&apos;s tier update didn&apos;t finish</p>
              <p className="mt-0.5 text-[15px]">{friendlyRunError(failedUpdate.error)} The app tries again every hour.</p>
            </div>
          </div>
          <Link href="/staff/settings/monthly-update" className={buttonVariants({ variant: "destructive" })}>
            Open Monthly update
          </Link>
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <span className="grid size-10 place-items-center rounded-md bg-secondary text-brand-blue">
              <UserRound aria-hidden className="size-5" />
            </span>
            <CardTitle className="text-base">Your role</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{ROLE_LABELS[employee.role]}</p>
            <p className="mt-1 text-sm text-muted-foreground">{employee.email}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <span className="grid size-10 place-items-center rounded-md bg-secondary text-brand-blue">
              <Store aria-hidden className="size-5" />
            </span>
            <CardTitle className="text-base">Current store</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{store?.name ?? "None selected"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{store?.code ?? "Choose a store from the top bar."}</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
