"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { History, IdCard, LayoutDashboard, Menu, Receipt, ScanLine, SlidersHorizontal, Store, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavKey = "dashboard" | "customers" | "transactions" | "kiosk" | "stores" | "employees" | "tiers" | "audit";

const ITEMS: Record<NavKey, { href: string; label: string; icon: typeof Store }> = {
  dashboard: { href: "/staff", label: "Dashboard", icon: LayoutDashboard },
  customers: { href: "/staff/customers", label: "Customers", icon: IdCard },
  transactions: { href: "/staff/transactions/new", label: "Record transaction", icon: Receipt },
  kiosk: { href: "/staff/kiosk", label: "Check-in kiosk", icon: ScanLine },
  stores: { href: "/staff/stores", label: "Stores", icon: Store },
  employees: { href: "/staff/employees", label: "Employees", icon: Users },
  tiers: { href: "/staff/settings/tiers", label: "Tier settings", icon: SlidersHorizontal },
  audit: { href: "/staff/audit", label: "Audit log", icon: History },
};

/** Sidebar on desktop; slide-down menu on tablet/phone. Items are pre-filtered by role on the server. */
export function StaffNav({ items }: { items: NavKey[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = (
    <ul className="flex flex-col gap-1">
      {items.map((key) => {
        const { href, label, icon: Icon } = ITEMS[key];
        const active = href === "/staff" ? pathname === "/staff" : pathname.startsWith(href);
        return (
          <li key={key}>
            <Link
              href={href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white",
                active && "bg-white/12 text-white shadow-[inset_3px_0_0_var(--brand-yellow)]",
              )}
            >
              <Icon aria-hidden className="size-[18px]" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        className="grid size-11 place-items-center rounded-md text-white hover:bg-white/10 lg:hidden"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="absolute inset-x-0 top-full z-20 bg-brand-navy-deep px-4 pb-4 shadow-xl lg:hidden">
          {links}
        </nav>
      )}
      <nav aria-label="Main" className="hidden lg:block">
        {links}
      </nav>
    </>
  );
}
