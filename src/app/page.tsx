import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Mail, ScanLine, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { TierBadge, type TierKey } from "@/components/tier-badge";
import { siteConfig } from "@/config/site";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/server/auth";

const TIERS: TierKey[] = ["base", "silver", "gold", "diamond"];

/**
 * The one way in. Someone already signed in goes straight to their own pages (staff → staff app,
 * member → member page). Everyone else chooses how to sign in. The store tablet never shows this
 * page: it always opens the check-in kiosk, where a card or PIN is used and the visit counts.
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

      <header className="relative mx-auto flex w-full max-w-5xl items-center px-5 pt-6 sm:px-8">
        <Logo priority className="w-32 sm:w-44" />
      </header>

      <section className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-5 py-12 text-center sm:px-8">
        <p className="text-sm font-semibold tracking-[0.25em] text-brand-yellow uppercase">Maximus Members</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-balance sm:text-6xl">Welcome back</h1>
        <p className="mt-4 max-w-xl text-lg text-white/75">Sign in to see your tier, your progress and the latest raffles.</p>

        <div className="mt-10 grid w-full max-w-2xl gap-4 sm:grid-cols-2">
          <Link
            href="/my/login"
            className="group flex flex-col items-start gap-3 rounded-3xl bg-white p-6 text-left text-brand-navy-deep shadow-2xl transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-yellow"
          >
            <span className="grid size-12 place-items-center rounded-full bg-brand-yellow">
              <Mail aria-hidden className="size-6" />
            </span>
            <span className="text-xl font-bold">I&apos;m a member</span>
            <span className="text-sm text-muted-foreground">Sign in with your email. We send you a code. New here? You can join too.</span>
            <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue">
              Member sign in <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
          <Link
            href="/staff/login"
            className="group flex flex-col items-start gap-3 rounded-3xl border-2 border-white/25 bg-white/10 p-6 text-left backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-yellow"
          >
            <span className="grid size-12 place-items-center rounded-full bg-white/15">
              <ShieldCheck aria-hidden className="size-6 text-brand-yellow" />
            </span>
            <span className="text-xl font-bold">I work at Maximus</span>
            <span className="text-sm text-white/70">Staff, Managers and the Owner sign in with email and password.</span>
            <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-brand-yellow">
              Staff sign in <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>

        <p className="mt-8 flex max-w-xl items-start gap-2 text-left text-sm text-white/70">
          <ScanLine aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-yellow" />
          In a Maximus store? Scan your card or type your PIN at the check-in tablet. That counts your visit.
        </p>

        <div aria-hidden className="mt-12 hidden items-center gap-3 opacity-80 sm:flex">
          {TIERS.map((tier) => (
            <TierBadge key={tier} tier={tier} tone="dark" />
          ))}
        </div>
      </section>

      <footer className="relative py-5 text-center text-sm text-white/50">© {siteConfig.name}</footer>
    </main>
  );
}
