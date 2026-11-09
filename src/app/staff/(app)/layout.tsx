import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftRight, LogOut, Store } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { type NavKey, StaffNav } from "@/components/staff/staff-nav";
import { ROLE_LABELS, canManageLocations, canViewAuditLog, canViewEmployees } from "@/lib/permissions";
import { signOutAction } from "@/server/actions/auth";
import { requireEmployee } from "@/server/auth";
import { getSelectedStore } from "@/server/store-context";

/** Shell for every signed-in staff page: sidebar, store switcher, user menu. */
export default async function StaffAppLayout({ children }: { children: React.ReactNode }) {
  const [employee, store] = await Promise.all([requireEmployee(), getSelectedStore()]);

  // Everyone works "at" a store. Owners may continue without one (e.g. to create the first store).
  if (!store && employee.role !== "owner") redirect("/staff/select-store");

  const nav: NavKey[] = ["dashboard", "customers", "transactions", "kiosk"];
  if (canManageLocations(employee.role)) nav.push("stores");
  if (canViewEmployees(employee.role)) nav.push("employees");
  if (canViewAuditLog(employee.role)) nav.push("audit");

  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      <aside className="relative z-10 flex items-center justify-between bg-brand-navy-deep px-4 py-3 lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:flex-col lg:items-stretch lg:justify-start lg:gap-8 lg:px-4 lg:py-6">
        <Link href="/staff" aria-label="Staff dashboard" className="lg:px-2">
          <Logo className="w-28 lg:w-40" />
        </Link>
        <StaffNav items={nav} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 sm:px-6">
          <Link
            href="/staff/select-store"
            className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted"
          >
            <Store aria-hidden className="size-4 text-brand-blue" />
            {store ? store.name : "No store selected"}
            <ArrowLeftRight aria-hidden className="size-3.5 text-muted-foreground" />
            <span className="sr-only">Switch store</span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold">
                {employee.firstName} {employee.lastName}
              </p>
              <p className="text-xs text-muted-foreground">{ROLE_LABELS[employee.role]}</p>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <LogOut aria-hidden className="size-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
