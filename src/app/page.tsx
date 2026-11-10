import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { TierBadge, type TierKey } from "@/components/tier-badge";
import { siteConfig } from "@/config/site";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/server/auth";
import { HomePinPad } from "./home-pin-pad";

const TIERS: TierKey[] = ["base", "silver", "gold", "diamond"];

/**
 * The home page looks like the kiosk: everyone signs in with their PIN, and the PIN decides
 * who they are (customer → member page, staff → dashboard). Signing in here never counts a
 * visit. The store tablet (kiosk mode) never shows this page: it opens the real check-in kiosk.
 */
export default async function HomePage() {
  if (isSupabaseConfigured()) {
    const employee = await getCurrentEmployee();
    if (employee) redirect("/staff");
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) redirect("/my");
  }

  return (
    <main className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-brand-navy-deep text-white">
      <div aria-hidden className="pointer-events-none absolute -top-48 -right-40 size-[36rem] rounded-full bg-brand-blue/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-56 -left-32 size-[30rem] rounded-full bg-brand-yellow/10 blur-3xl" />

      <header className="relative flex items-center px-5 py-4 sm:px-8">
        <Logo priority className="w-32 sm:w-44" />
      </header>

      <section className="relative flex flex-1 flex-col items-center justify-center px-5 pb-6 text-center">
        <p className="text-sm font-semibold tracking-[0.25em] text-brand-yellow uppercase sm:text-base">Welcome to Maximus</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">Enter your PIN</h1>
        <div className="mt-3 flex w-full justify-center">
          <HomePinPad />
        </div>

        <p className="mt-6 text-sm text-white/60">
          No PIN yet?{" "}
          <Link href="/my/login" className="font-semibold text-white underline-offset-4 hover:underline">
            Sign in with email
          </Link>
          <span aria-hidden className="mx-2">·</span>
          <Link href="/staff/login" className="font-semibold text-white underline-offset-4 hover:underline">
            Staff password
          </Link>
        </p>

        <div aria-hidden className="mt-8 hidden items-center gap-3 opacity-80 sm:flex">
          {TIERS.map((tier) => (
            <TierBadge key={tier} tier={tier} tone="dark" />
          ))}
        </div>
      </section>

      <footer className="relative py-5 text-center text-sm text-white/50">© {siteConfig.name}</footer>
    </main>
  );
}
