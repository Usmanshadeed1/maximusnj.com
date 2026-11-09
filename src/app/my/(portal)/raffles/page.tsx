import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Ticket } from "lucide-react";
import { getMemberAccess, getPortalRaffles } from "@/server/portal";
import { RaffleCard } from "./raffle-card";

export const metadata: Metadata = { title: "Raffles" };

export default async function MemberRafflesPage() {
  const access = await getMemberAccess();
  if (access.status !== "member") redirect("/my/login");
  const raffles = await getPortalRaffles();

  // A win goes to the top.
  const mine = raffles.filter((r) => r.entered || r.result).sort((a, b) => Number(b.result?.state === "won") - Number(a.result?.state === "won"));
  const others = raffles.filter((r) => !r.entered && (r.phase === "open" || r.phase === "upcoming"));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight text-brand-navy-deep">Raffles</h1>

      {!access.data.active && (
        <p role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Your membership is paused, so you can&apos;t enter raffles right now. Please visit a store.
        </p>
      )}

      {mine.length > 0 && (
        <section aria-labelledby="mine" className="flex flex-col gap-4">
          <h2 id="mine" className="text-base font-bold text-brand-navy-deep">
            My entries
          </h2>
          {mine.map((r) => (
            <RaffleCard key={r.id} raffle={r} active={access.data.active} />
          ))}
        </section>
      )}

      <section aria-labelledby="open" className="flex flex-col gap-4">
        <h2 id="open" className="text-base font-bold text-brand-navy-deep">
          Open raffles
        </h2>
        {others.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl bg-white px-4 py-12 text-center shadow-sm ring-1 ring-border">
            <span className="grid size-12 place-items-center rounded-full bg-secondary text-brand-blue">
              <Ticket aria-hidden className="size-6" />
            </span>
            <p className="font-semibold">No open raffles right now</p>
            <p className="max-w-xs text-sm text-muted-foreground">When a new release raffle opens, it will show up here.</p>
          </div>
        ) : (
          others.map((r) => <RaffleCard key={r.id} raffle={r} active={access.data.active} />)
        )}
      </section>
    </div>
  );
}
