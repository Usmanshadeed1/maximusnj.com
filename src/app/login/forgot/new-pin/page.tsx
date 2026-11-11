import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { resetWho } from "@/server/actions/forgot-pin";
import { NewPinForm } from "./new-pin-form";

export const metadata: Metadata = { title: "Choose a new PIN" };

/** Opened from the email link: the person is signed in by email and chooses a new PIN. */
export default async function NewPinPage() {
  const who = await resetWho();
  if (who === "signed_out") redirect("/login/forgot");

  return (
    <main className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-brand-navy-deep text-white">
      <div aria-hidden className="pointer-events-none absolute -top-48 -right-40 size-[36rem] rounded-full bg-brand-blue/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-56 -left-32 size-[30rem] rounded-full bg-brand-yellow/10 blur-3xl" />

      <header className="relative flex items-center px-5 py-4 sm:px-8 sm:py-6">
        <Logo priority className="w-32 sm:w-44" />
      </header>

      <section className="relative flex flex-1 flex-col items-center justify-center px-5 pb-12">
        <p className="text-sm font-semibold tracking-[0.25em] text-brand-yellow uppercase">Maximus</p>
        <h1 className="mt-3 text-center text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">Choose a new PIN</h1>
        <div className="mt-8 w-full max-w-md rounded-3xl bg-white p-6 text-foreground shadow-2xl sm:p-8">
          {who === "unknown" ? (
            <p className="text-[15px]">
              We couldn&apos;t find a membership with this email. Please ask at the store.{" "}
              <Link href="/login" className="font-medium text-brand-blue hover:underline">
                Back to login
              </Link>
            </p>
          ) : (
            <NewPinForm />
          )}
        </div>
      </section>
    </main>
  );
}
