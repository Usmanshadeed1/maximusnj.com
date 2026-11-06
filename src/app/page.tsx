import Link from "next/link";
import { ScanLine, Ticket, TrendingUp } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { TierBadge, type TierKey } from "@/components/tier-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { siteConfig } from "@/config/site";

const TIERS: TierKey[] = ["base", "silver", "gold", "diamond"];

const FEATURES = [
  {
    icon: TrendingUp,
    title: "Earn your tier every month",
    description:
      "Shop and visit any Maximus store to move up from Base to Silver, Gold and Diamond.",
  },
  {
    icon: Ticket,
    title: "Release raffles",
    description:
      "Enter raffles for new releases online or in store. One entry per member, fair odds for everyone.",
  },
  {
    icon: ScanLine,
    title: "Scan in at the door",
    description: "Your member card checks you in at the entrance in a second.",
  },
] as const;

export default function HomePage() {
  const isProduction = siteConfig.appEnv === "production";

  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-navy-deep text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-32 size-[28rem] rounded-full bg-brand-blue/40 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-48 -left-24 size-[22rem] rounded-full bg-brand-yellow/15 blur-3xl"
        />

        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 pt-6 pb-20 sm:px-6 lg:flex-row lg:items-center lg:gap-16 lg:pt-8 lg:pb-28">
          <div className="flex-1">
            <div className="flex items-center justify-between lg:mb-20">
              <Logo priority className="w-36 sm:w-44" />
              {!isProduction && (
                <Badge variant="accent" data-testid="env-badge">
                  {siteConfig.appEnv}
                </Badge>
              )}
            </div>

            <div className="mt-14 lg:mt-0">
              <p className="text-sm font-semibold tracking-[0.2em] text-brand-yellow uppercase">
                Members Club · Coming soon
              </p>
              <h1 className="mt-4 text-4xl leading-[1.1] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                Your collection deserves <span className="text-brand-yellow">VIP treatment.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-white/75">
                Earn loyalty tiers, enter release raffles, and track your progress — all from your
                phone. No app to download.
              </p>
            </div>
          </div>

          {/* Member card preview */}
          <div className="flex flex-1 justify-center lg:justify-end">
            <div
              role="img"
              aria-label="Preview of a Maximus member card"
              className="relative aspect-[1.586] w-full max-w-sm rotate-[-3deg] rounded-2xl bg-gradient-to-br from-brand-blue via-brand-navy to-brand-navy-deep p-6 shadow-2xl ring-1 ring-white/15 transition-transform duration-500 hover:rotate-0"
            >
              <div className="flex h-full flex-col justify-between">
                <div className="flex items-start justify-between">
                  <Logo className="w-28" />
                  <TierBadge tier="gold" />
                </div>
                <div>
                  <p className="text-xs tracking-[0.25em] text-white/60 uppercase">Member</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tracking-widest">MAX000001</p>
                  <div
                    aria-hidden
                    className="mt-3 h-8 w-3/4 rounded-sm bg-[repeating-linear-gradient(90deg,#fff_0_2px,transparent_2px_4px,#fff_4px_5px,transparent_5px_8px)] opacity-80"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tier ladder */}
      <section className="mx-auto -mt-10 w-full max-w-6xl px-4 sm:px-6">
        <Card className="relative">
          <CardContent className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:justify-between">
            <p className="text-sm font-semibold text-muted-foreground">Four tiers to climb</p>
            <ol className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {TIERS.map((tier, index) => (
                <li key={tier} className="flex items-center gap-2 sm:gap-3">
                  <TierBadge tier={tier} />
                  {index < TIERS.length - 1 && (
                    <span aria-hidden className="text-muted-foreground">
                      →
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </section>

      {/* Features */}
      <section className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-14 sm:px-6 md:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <Card key={title}>
            <CardHeader>
              <span className="mb-2 grid size-11 place-items-center rounded-lg bg-secondary text-brand-blue">
                <Icon aria-hidden className="size-5" />
              </span>
              <CardTitle>{title}</CardTitle>
              <CardDescription className="text-[0.95rem] leading-relaxed">
                {description}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <footer className="mt-auto border-t bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p>© {siteConfig.name}</p>
          <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-4">
            <p>Ask in store about joining the members club.</p>
            <Link
              href="/staff/login"
              className="rounded-md px-2 py-1 font-medium text-muted-foreground underline-offset-4 hover:text-brand-blue hover:underline"
            >
              Staff sign in
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
