"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, Home, Settings, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/my", label: "Home", icon: Home },
  { href: "/my/raffles", label: "Raffles", icon: Ticket },
  { href: "/my/history", label: "History", icon: History },
  { href: "/my/settings", label: "Settings", icon: Settings },
] as const;

/** Tabs along the bottom on a phone, links in the header on a computer. */
export function PortalNav({ variant }: { variant: "top" | "bottom" }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/my" ? pathname === "/my" : pathname.startsWith(href));

  if (variant === "top") {
    return (
      <nav aria-label="Member pages" className="hidden items-center gap-1 sm:flex">
        {ITEMS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              isActive(href) ? "bg-white/15 text-brand-yellow" : "text-white/75 hover:bg-white/10 hover:text-white",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Member pages"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(20_21_67/0.08)] backdrop-blur sm:hidden"
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-4">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors",
                  active ? "text-brand-blue" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-14 place-items-center rounded-full transition-colors",
                    active && "bg-brand-yellow/80 text-brand-navy-deep",
                  )}
                >
                  <Icon aria-hidden className="size-5" />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
