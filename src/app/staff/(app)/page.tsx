import type { Metadata } from "next";
import { Store, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ROLE_LABELS } from "@/lib/permissions";
import { requireEmployee } from "@/server/auth";
import { getSelectedStore } from "@/server/store-context";

export const metadata: Metadata = { title: "Dashboard" };

export default async function StaffDashboardPage() {
  const employee = await requireEmployee();
  const store = await getSelectedStore();

  return (
    <>
      <PageHeader title={`Welcome, ${employee.firstName}`} description="Maximus Members staff app" />
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
