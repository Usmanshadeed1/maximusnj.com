import * as React from "react";
import { Logo } from "@/components/brand/logo";
import { Card } from "@/components/ui/card";

/** Centered branded card used by login, password and store-picker screens. */
export function AuthShell({
  title,
  description,
  eyebrow = "Staff",
  children,
}: {
  title: string;
  description?: string;
  /** Small label above the title: "Staff" or "Members". */
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh flex-1 items-center justify-center overflow-hidden bg-brand-navy-deep px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-32 size-[28rem] rounded-full bg-brand-blue/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -left-24 size-[22rem] rounded-full bg-brand-yellow/10 blur-3xl"
      />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo priority className="w-44" />
        </div>
        <Card className="p-6 sm:p-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-blue uppercase">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-navy-deep">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
          <div className="mt-6">{children}</div>
        </Card>
      </div>
    </main>
  );
}
