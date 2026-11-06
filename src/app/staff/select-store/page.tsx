import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Store } from "lucide-react";
import { AuthShell } from "@/components/staff/auth-shell";
import { buttonVariants } from "@/components/ui/button";
import { selectStoreAction, signOutAction } from "@/server/actions/auth";
import { requireEmployee } from "@/server/auth";
import { getMyActiveStores } from "@/server/store-context";

export const metadata: Metadata = { title: "Choose your store" };

export default async function SelectStorePage() {
  const employee = await requireEmployee();
  const stores = await getMyActiveStores();

  // Owners without any store yet go straight in, so they can create one.
  if (stores.length === 0 && employee.role === "owner") redirect("/staff/stores");

  return (
    <AuthShell title="Choose your store" description="Which store are you working at on this device?">
      {stores.length === 0 ? (
        <div className="flex flex-col gap-4">
          <p className="rounded-md bg-secondary px-3 py-3 text-sm text-secondary-foreground">
            You aren&apos;t assigned to a store yet. Ask your Manager or the Owner to add you to one.
          </p>
          <form action={signOutAction}>
            <button type="submit" className={buttonVariants({ variant: "outline", className: "w-full" })}>
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {stores.map((store) => (
            <li key={store.id}>
              <form action={selectStoreAction}>
                <input type="hidden" name="storeId" value={store.id} />
                <button
                  type="submit"
                  className="group flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3.5 text-left transition hover:border-brand-blue hover:bg-secondary/60"
                >
                  <span className="grid size-10 place-items-center rounded-md bg-secondary text-brand-blue">
                    <Store aria-hidden className="size-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">{store.name}</span>
                    <span className="block text-xs text-muted-foreground">{store.code}</span>
                  </span>
                  <ChevronRight aria-hidden className="size-5 text-muted-foreground group-hover:text-brand-blue" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {employee.role === "owner" && stores.length > 0 && (
        <p className="mt-5 text-center text-sm">
          <Link href="/staff/stores" className="font-medium text-brand-blue hover:underline">
            Manage stores
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
