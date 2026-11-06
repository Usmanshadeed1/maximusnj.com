import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft, Lock, ScanLine, ShieldCheck, Store } from "lucide-react";
import { AuthShell } from "@/components/staff/auth-shell";
import { buttonVariants } from "@/components/ui/button";
import { startKioskAction } from "@/server/actions/kiosk";
import { requireEmployee } from "@/server/auth";
import { KIOSK_COOKIE, getKioskLockMinutes, getKioskStore } from "@/server/kiosk-context";
import { getSelectedStore } from "@/server/store-context";
import { KioskScreen } from "./kiosk-screen";
import { StaffCredentialsForm } from "./staff-credentials-form";

export const metadata: Metadata = { title: "Check-in kiosk" };

export default async function KioskPage() {
  await requireEmployee();
  const inKioskMode = (await cookies()).has(KIOSK_COOKIE);

  if (!inKioskMode) return <KioskIntro />;

  const [store, lockMinutes] = await Promise.all([getKioskStore(), getKioskLockMinutes()]);
  if (!store) {
    return (
      <AuthShell
        title="Kiosk unavailable"
        description="This kiosk's store is inactive, or the signed-in staff member no longer works there. A staff member can exit kiosk mode below."
      >
        <StaffCredentialsForm intent="exit" />
      </AuthShell>
    );
  }

  return <KioskScreen storeName={store.name} lockMinutes={lockMinutes} />;
}

/** Explains kiosk mode and starts it on this device for the selected store. */
async function KioskIntro() {
  const store = await getSelectedStore();

  return (
    <AuthShell
      title="Check-in kiosk"
      description="Turn this device into the entrance tablet. Customers scan their member card when they arrive."
    >
      <ul className="mb-6 flex flex-col gap-3 text-sm">
        <Point icon={ScanLine}>Works with a Bluetooth barcode scanner, or customers can type their number.</Point>
        <Point icon={ShieldCheck}>Shows only the member&apos;s first name and tier — nothing else.</Point>
        <Point icon={Lock}>Locks when idle. Leaving kiosk mode needs a staff email and password.</Point>
      </ul>

      {store ? (
        <form action={startKioskAction} className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-lg border bg-secondary/50 px-4 py-3">
            <Store aria-hidden className="size-5 text-brand-blue" />
            <div className="text-sm">
              <p className="text-muted-foreground">Kiosk for</p>
              <p className="font-semibold">{store.name}</p>
            </div>
          </div>
          <button type="submit" className={buttonVariants({ size: "kiosk", className: "w-full" })}>
            <ScanLine aria-hidden /> Start kiosk on this device
          </button>
        </form>
      ) : (
        <Link href="/staff/select-store" className={buttonVariants({ size: "lg", className: "w-full" })}>
          <Store aria-hidden /> Choose a store first
        </Link>
      )}

      <p className="mt-5 text-center text-sm">
        <Link href="/staff" className="inline-flex items-center gap-1 font-medium text-brand-blue hover:underline">
          <ArrowLeft aria-hidden className="size-4" /> Back to dashboard
        </Link>
      </p>
    </AuthShell>
  );
}

function Point({ icon: Icon, children }: { icon: typeof Lock; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-brand-blue">
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="pt-1.5">{children}</span>
    </li>
  );
}
