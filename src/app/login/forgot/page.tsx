import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ForgotFlow } from "./forgot-flow";

export const metadata: Metadata = { title: "Forgot PIN or card" };

/** Forgot PIN or card: one simple flow for everyone (members and staff). */
export default function ForgotPage() {
  return (
    <main className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-brand-navy-deep text-white">
      <div aria-hidden className="pointer-events-none absolute -top-48 -right-40 size-[36rem] rounded-full bg-brand-blue/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-56 -left-32 size-[30rem] rounded-full bg-brand-yellow/10 blur-3xl" />

      <header className="relative flex items-center justify-between gap-4 px-5 py-4 sm:px-8 sm:py-6">
        <Logo priority className="w-32 sm:w-44" />
        <Link
          href="/login"
          className="inline-flex h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold text-white/85 transition hover:bg-white/20 hover:text-white"
        >
          <ArrowLeft aria-hidden className="size-4" /> Back
        </Link>
      </header>

      <section className="relative flex flex-1 flex-col items-center justify-center px-5 pb-12">
        <p className="text-sm font-semibold tracking-[0.25em] text-brand-yellow uppercase">Maximus</p>
        <h1 className="mt-3 text-center text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">Forgot your PIN or card?</h1>
        <div className="mt-8 w-full max-w-md rounded-3xl bg-white p-6 text-foreground shadow-2xl sm:p-8">
          <ForgotFlow />
        </div>
      </section>
    </main>
  );
}
