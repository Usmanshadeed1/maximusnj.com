import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, Globe, Lock, Pencil, Store, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatBusinessDateTime } from "@/lib/format";
import { PHASE_INFO, describeChannels } from "@/lib/raffles";
import { requireEmployee } from "@/server/auth";
import { searchCustomers, getStoreNameMap } from "@/server/customers";
import { isEmailConfigured } from "@/server/email";
import { getRaffleDetail, getStoresForRaffles } from "@/server/raffles";
import { getSelectedStore } from "@/server/store-context";
import { enterMemberAction } from "@/server/actions/raffles";
import { CustomerSearch } from "../../../customers/customer-search";
import { CancelRaffleDialog, RemoveEntryDialog } from "../../raffle-forms";
import { RaffleSteps } from "./raffle-steps";
import { ResultsCard } from "./results-card";
import { ChangeProductsDialog, EnterWithChoicesDialog } from "../../product-parts";
import { getChoicesByEntry, getProducts, getRaffleProducts } from "@/server/products";

export const metadata: Metadata = { title: "Raffle" };

const PICKUP_TEXT = { raffle_store: "This raffle's store", home_store: "The winner's home store", specific_store: "" };

export default async function RafflePage({ params, searchParams }: PageProps<"/staff/raffles/[releaseId]/[raffleId]">) {
  const employee = await requireEmployee();
  const [{ releaseId, raffleId }, flags] = await Promise.all([params, searchParams]);
  const detail = await getRaffleDetail(releaseId, raffleId, employee.role);
  if (!detail) notFound();
  const { release, raffle, siblings, entries, results } = detail;

  const q = typeof flags.q === "string" ? flags.q.trim() : "";
  const accepting = raffle.phase === "open";
  const editable = raffle.canManage && ["draft", "upcoming", "open"].includes(raffle.phase);
  const activeEntries = entries.filter((e) => e.status === "active");
  const pastEntries = entries.filter((e) => e.status !== "active");
  const message = typeof flags.error === "string" ? flags.error : null;
  const okMessage = typeof flags.ok === "string" ? flags.ok : null;
  const drawn = raffle.phase === "drawn" || raffle.phase === "completed";

  const [found, storeNames, stores, selectedStore] = await Promise.all([
    accepting && q ? searchCustomers(q) : Promise.resolve([]),
    getStoreNameMap(),
    drawn ? getStoresForRaffles() : Promise.resolve([]),
    drawn ? getSelectedStore() : Promise.resolve(null),
  ]);
  const enteredIds = new Set(activeEntries.map((e) => e.customerId));
  const [raffleProducts, allProducts, choices] = await Promise.all([
    getRaffleProducts(raffleId),
    raffle.canManage && editable ? getProducts() : Promise.resolve([]),
    getChoicesByEntry([...entries.map((e) => e.id), ...results.map((r) => r.entryId)]),
  ]);
  const offered = raffleProducts.map((p) => ({ id: p.id, name: p.name, description: p.description, imageUrl: p.imageUrl }));
  // Offer every active product, plus any already on this raffle (even if turned off since).
  const pickable = [...offered, ...allProducts.filter((p) => !raffleProducts.some((r) => r.id === p.id)).map((p) => ({ id: p.id, name: p.name, description: p.description, imageUrl: p.image_url }))];

  const ScopeIcon = raffle.scope === "company" ? Globe : Store;

  return (
    <div className="w-full max-w-4xl">
      <Link href={`/staff/raffles/${releaseId}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> {release.name}
      </Link>

      {message && (
        <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/8 px-5 py-3.5 text-sm font-medium text-destructive">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" /> {message}
        </div>
      )}
      {okMessage && (
        <div role="status" className="mb-5 flex items-start gap-2 rounded-xl border border-success/30 bg-success/8 px-5 py-3.5 text-sm font-medium text-success">
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" /> {okMessage}
        </div>
      )}
      {(flags.published === "1" || flags.saved === "1" || flags.entered === "1") && (
        <div role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-success/30 bg-success/8 px-5 py-3.5 text-sm font-medium text-success">
          <CheckCircle2 aria-hidden className="size-4" />
          {flags.published === "1" ? "Published. Members can see the raffle and enter from its opening time." : flags.saved === "1" ? "Changes saved." : "Member entered."}
        </div>
      )}

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-blue">
              <ScopeIcon aria-hidden className="size-4" /> {raffle.storeName}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-navy-deep">{release.name}</h1>
            <div className="mt-2.5">
              <Badge variant={PHASE_INFO[raffle.phase].variant}>{PHASE_INFO[raffle.phase].label}</Badge>
            </div>
          </div>
          {raffle.canManage && (
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {editable && (
                <Link href={`/staff/raffles/${releaseId}/${raffleId}/edit`} className={buttonVariants({ variant: "outline", size: "lg" })}>
                  <Pencil aria-hidden /> Edit
                </Link>
              )}
              {["draft", "upcoming", "open", "closed"].includes(raffle.phase) && !drawn && (
                <CancelRaffleDialog releaseId={releaseId} raffleId={raffleId} label={raffle.storeName} />
              )}
            </div>
          )}
        </div>

        <dl className="mt-5 grid gap-x-8 gap-y-4 border-t pt-5 sm:grid-cols-2">
          <Detail label="Collect within">{raffle.claim_deadline_hours} hours of winning</Detail>
          <Detail label="Opens">{formatBusinessDateTime(raffle.opens_at)}</Detail>
          <Detail label="Closes">{formatBusinessDateTime(raffle.closes_at)}</Detail>
          <Detail label="Pickup">{raffle.pickup_rule === "specific_store" ? (raffle.pickupName ?? "—") : PICKUP_TEXT[raffle.pickup_rule]}</Detail>
          <Detail label="Picked people are told by">{describeChannels(raffle.allowed_channels)}</Detail>
        </dl>
        {raffle.status === "cancelled" && raffle.cancelled_reason && (
          <p className="mt-4 rounded-lg bg-muted px-4 py-3 text-sm">
            <strong>Cancelled:</strong> {raffle.cancelled_reason}
          </p>
        )}
        {siblings.length > 0 && raffle.scope === "store" && (
          <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
            A member can enter only one store&apos;s raffle for this release.
          </p>
        )}
      </Card>

      <RaffleSteps
        releaseId={releaseId}
        raffleId={raffleId}
        phase={raffle.phase}
        canManage={raffle.canManage}
        opensAt={raffle.opens_at}
        closesAt={raffle.closes_at}
        entries={activeEntries.length}
      />

      <Card className="mt-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-brand-navy-deep">Products</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {offered.length === 0
                ? "No products: this raffle is for a single item."
                : "Members rank the products they want. After the draw you give each person a product by hand."}
            </p>
          </div>
          {raffle.canManage && editable && (
            <ChangeProductsDialog releaseId={releaseId} raffleId={raffleId} all={pickable} current={offered.map((p) => p.id)} />
          )}
        </div>
        {offered.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {offered.map((p) => (
              <li key={p.id} className="inline-flex items-center gap-2 rounded-full border bg-secondary/50 px-3 py-1.5 text-sm font-medium">
                {p.name}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {drawn && results.length > 0 && (
        <ResultsCard
          releaseId={releaseId}
          raffleId={raffleId}
          results={results}
          completed={raffle.phase === "completed"}
          canManage={raffle.canManage}
          stores={stores}
          defaultStoreId={selectedStore?.id ?? stores[0]?.id ?? ""}
          emailReady={isEmailConfigured()}
          products={offered}
          choices={Object.fromEntries(choices)}
        />
      )}

      {/* In-store entry */}
      {raffle.entryCount !== null && (
        <Card className="mt-6 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-brand-navy-deep">
            <UserPlus aria-hidden className="size-5 text-brand-blue" /> Enter a member in store
          </h2>
          {accepting ? (
            <>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">Scan their card or search by name, phone or email.</p>
              <CustomerSearch initialQuery={q} basePath={`/staff/raffles/${releaseId}/${raffleId}`} />
              {q && found.length === 0 && <p className="text-sm text-muted-foreground">No member found. Register them first, then come back.</p>}
              {found.length > 0 && (
                <ul className="divide-y rounded-lg border">
                  {found.slice(0, 8).map((c) => {
                    const already = enteredIds.has(c.id);
                    const inactive = c.status !== "active";
                    return (
                      <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-semibold">
                            {c.first_name} {c.last_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            <span className="font-mono">{c.member_number}</span> · {storeNames.get(c.home_location_id) ?? ""}
                          </p>
                        </div>
                        {already ? (
                          <Badge variant="success">Already entered</Badge>
                        ) : inactive ? (
                          <Badge variant="secondary">Inactive</Badge>
                        ) : (
                          offered.length > 0 ? (
                            <EnterWithChoicesDialog
                              releaseId={releaseId}
                              raffleId={raffleId}
                              customerId={c.id}
                              name={`${c.first_name} ${c.last_name}`}
                              products={offered}
                            />
                          ) : (
                            <form action={enterMemberAction}>
                              <input type="hidden" name="releaseId" value={releaseId} />
                              <input type="hidden" name="raffleId" value={raffleId} />
                              <input type="hidden" name="customerId" value={c.id} />
                              <Button type="submit">Enter in raffle</Button>
                            </form>
                          )
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {raffle.phase === "draft"
                ? "Open the raffle for entries first."
                : raffle.phase === "upcoming"
                  ? "Entries start at the opening time."
                  : "Entries are closed."}
            </p>
          )}
        </Card>
      )}

      {/* Entries */}
      <Card className="mt-6 p-5 sm:p-6">
        <h2 className="text-base font-bold text-brand-navy-deep">
          Entries {raffle.entryCount !== null && <span className="text-muted-foreground">({raffle.entryCount})</span>}
        </h2>
        {raffle.entryCount === null ? (
          <p className="mt-2 text-sm text-muted-foreground">Entries are visible to staff of this raffle&apos;s store.</p>
        ) : activeEntries.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No entries yet.</p>
        ) : (
          <ul className="mt-3 divide-y">
            {activeEntries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/staff/customers/${e.customerId}`} className="text-[15px] font-semibold hover:underline">
                    {e.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-mono">{e.memberNumber}</span> · {e.homeStore}
                  </p>
                  {choices.get(e.id)?.length ? (
                    <p className="mt-0.5 text-sm">
                      <span className="text-muted-foreground">Wants: </span>
                      {choices.get(e.id)!.map((c, i) => `${i + 1}. ${c}`).join("  ·  ")}
                    </p>
                  ) : null}
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <p>{e.channel === "online" ? "Online" : e.enteredBy ? `In store · ${e.enteredBy}` : "In store"}</p>
                  <p>{formatBusinessDateTime(e.enteredAt)}</p>
                </div>
                {!["drawn", "completed", "cancelled"].includes(raffle.phase) && (
                  <RemoveEntryDialog releaseId={releaseId} raffleId={raffleId} entryId={e.id} name={e.name} />
                )}
              </li>
            ))}
          </ul>
        )}

        {pastEntries.length > 0 && (
          <details className="mt-5 border-t pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">
              Withdrawn and removed entries ({pastEntries.length})
            </summary>
            <ul className="mt-2 divide-y text-sm">
              {pastEntries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    <span className="font-semibold">{e.name}</span>{" "}
                    <span className="font-mono text-xs text-muted-foreground">{e.memberNumber}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {e.status === "withdrawn" ? "Withdrew" : `Removed: ${e.removedReason ?? ""}`}
                    {e.endedAt ? ` · ${formatBusinessDateTime(e.endedAt)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-[15px]">{children}</dd>
    </div>
  );
}
