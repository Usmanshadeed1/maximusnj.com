import { Download, FlagTriangleRight, Hand, Mail, PhoneCall, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatBusinessDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  completeRaffleAction,
  notifyWinnersAction,
  pickPersonAction,
  resendEmailsAction,
  winnerOutcomeAction,
} from "@/server/actions/raffle-results";
import type { ResultView } from "@/server/raffles";
import type { WinnerOutcome } from "@/types/database";
import type { PickerProduct } from "@/components/raffles/choice-picker";
import { AssignProductForm } from "../../product-parts";
import { ClaimDialog, ConfirmSubmitButton } from "./result-dialogs";

const OUTCOME_LABEL: Record<WinnerOutcome, string> = {
  pending: "Not told yet",
  notified: "Told, waiting",
  claimed: "Collected",
  expired: "Expired",
  declined: "Declined",
};

const OUTCOME_VARIANT: Record<WinnerOutcome, "secondary" | "accent" | "success" | "destructive" | "outline"> = {
  pending: "outline",
  notified: "accent",
  claimed: "success",
  expired: "destructive",
  declined: "destructive",
};

function Hidden({ releaseId, raffleId }: { releaseId: string; raffleId: string }) {
  return (
    <>
      <input type="hidden" name="releaseId" value={releaseId} />
      <input type="hidden" name="raffleId" value={raffleId} />
    </>
  );
}

/**
 * The ranked list after the draw (1, 2, 3… top to bottom). There is no fixed number of winners:
 * staff go down the list, pick a person, tell them, then mark what happened.
 */
export function ResultsCard({
  releaseId,
  raffleId,
  results,
  completed,
  canManage,
  stores,
  defaultStoreId,
  emailReady,
  products,
  choices,
}: {
  releaseId: string;
  raffleId: string;
  results: ResultView[];
  completed: boolean;
  canManage: boolean;
  stores: { id: string; name: string }[];
  defaultStoreId: string;
  emailReady: boolean;
  products: PickerProduct[];
  /** Entry id → the products that person asked for, in their order. */
  choices: Record<string, string[]>;
}) {
  const productNames = new Map(products.map((p) => [p.id, p.name]));
  const unTold = results.filter((r) => r.isWinner && r.outcome === "pending" && r.notifyState === null).length;
  const emailsWaiting = results.some((r) => r.email && r.email.status !== "sent" && r.outcome === "notified");
  const unresolved = results.some((r) => r.isWinner && ["pending", "notified"].includes(r.outcome));

  return (
    <Card className="mt-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-brand-navy-deep">Ranked list</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {results.length} {results.length === 1 ? "person" : "people"} in random order. Start from #1: press Pick, tell them, then mark what happened.
          </p>
        </div>
        {canManage && (
          <a href={`/staff/raffles/${releaseId}/${raffleId}/export`} className="inline-flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm font-semibold hover:bg-muted">
            <Download aria-hidden className="size-4" /> Export CSV
          </a>
        )}
      </div>

      {!completed && (
        <div className="mt-5 flex flex-col gap-3 rounded-xl bg-muted/60 p-4">
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <form action={notifyWinnersAction}>
                <Hidden releaseId={releaseId} raffleId={raffleId} />
                <input type="hidden" name="count" value={Math.max(unTold, 1)} />
                <Button type="submit" disabled={unTold === 0}>
                  <Send aria-hidden /> Tell picked people{unTold > 0 ? ` (${unTold})` : ""}
                </Button>
              </form>
            )}
            {emailsWaiting && (
              <form action={resendEmailsAction}>
                <Hidden releaseId={releaseId} raffleId={raffleId} />
                <Button type="submit" variant="outline">
                  <Mail aria-hidden /> Send emails again
                </Button>
              </form>
            )}
            {canManage && (
              <form action={completeRaffleAction}>
                <Hidden releaseId={releaseId} raffleId={raffleId} />
                <Button type="submit" variant="outline" disabled={unresolved}>
                  <FlagTriangleRight aria-hidden /> Finish raffle
                </Button>
              </form>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {unTold === 0
              ? "Picked people are told by the methods the raffle allows and they chose. Someone can't collect? Mark them expired or declined and pick the next person."
              : `${unTold} picked ${unTold === 1 ? "person is" : "people are"} waiting to be told.`}
            {!emailReady && " Email isn't set up yet, so emails will wait."}
          </p>
        </div>
      )}

      <ol className="mt-5 divide-y rounded-xl border">
        {results.map((r) => {
          const acting = !completed && r.isWinner && (r.outcome === "pending" || r.outcome === "notified");
          return (
            <li key={r.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5", r.isWinner && "bg-brand-yellow/12")}>
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums",
                  r.isWinner ? "bg-brand-yellow text-brand-navy-deep" : "bg-muted text-muted-foreground",
                )}
              >
                {r.position}
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-[15px] font-semibold">{r.name}</p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono">{r.memberNumber}</span> · {r.homeStore}
                  {r.channel && ` · ${r.channel === "online" ? "Entered online" : "Entered in store"}`}
                </p>
                {choices[r.entryId]?.length ? (
                  <p className="mt-1 text-sm">
                    <span className="text-muted-foreground">Wants: </span>
                    {choices[r.entryId].map((c, i) => `${i + 1}. ${c}`).join("  ·  ")}
                  </p>
                ) : null}
                {r.assignedProductId && (
                  <p className="mt-1 text-sm font-semibold text-success">Given: {productNames.get(r.assignedProductId) ?? "a product"}</p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {r.isWinner ? (
                    <>
                      <Badge variant={OUTCOME_VARIANT[r.outcome]}>{OUTCOME_LABEL[r.outcome]}</Badge>
                      {r.notifyState === "call_manually" && r.outcome === "pending" && (
                        <Badge variant="destructive">
                          <PhoneCall aria-hidden className="size-3" /> Call manually
                        </Badge>
                      )}
                      {r.deadlinePassed && <Badge variant="destructive">Deadline passed</Badge>}
                      {r.notifiedVia && r.outcome === "notified" && (
                        <span className="text-xs text-muted-foreground">
                          Told by {r.notifiedVia.replace("+", " and ")}
                          {r.deadlineAt && ` · collect by ${formatBusinessDateTime(r.deadlineAt)}`}
                        </span>
                      )}
                      {r.email && r.email.status === "sent" && <span className="text-xs text-success">Email sent</span>}
                      {r.email && r.email.status === "queued" && <span className="text-xs text-muted-foreground">Email waiting to send</span>}
                      {r.email && r.email.status === "failed" && (
                        <span className="text-xs font-medium text-destructive">Email not sent: {r.email.error ?? "failed"}</span>
                      )}
                    </>
                  ) : null}
                </div>
              </div>

              {!completed && products.length > 0 && (
                <AssignProductForm releaseId={releaseId} raffleId={raffleId} resultId={r.id} products={products} assignedId={r.assignedProductId} />
              )}

              {!completed && !r.isWinner && (
                <form action={pickPersonAction}>
                  <Hidden releaseId={releaseId} raffleId={raffleId} />
                  <input type="hidden" name="resultId" value={r.id} />
                  <Button type="submit" size="sm" variant="accent">
                    <Hand aria-hidden /> Pick
                  </Button>
                </form>
              )}

              {acting && (
                <div className="flex flex-wrap items-center gap-2">
                  <ClaimDialog
                    releaseId={releaseId}
                    raffleId={raffleId}
                    resultId={r.id}
                    name={r.name}
                    stores={stores}
                    defaultStoreId={defaultStoreId}
                  />
                  {r.outcome === "pending" && <OutcomeButton releaseId={releaseId} raffleId={raffleId} resultId={r.id} outcome="notified" label="I phoned them" />}
                  <OutcomeButton releaseId={releaseId} raffleId={raffleId} resultId={r.id} outcome="expired" label="Expired" danger />
                  <OutcomeButton releaseId={releaseId} raffleId={raffleId} resultId={r.id} outcome="declined" label="Declined" danger />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function OutcomeButton({
  releaseId,
  raffleId,
  resultId,
  outcome,
  label,
  danger,
}: {
  releaseId: string;
  raffleId: string;
  resultId: string;
  outcome: "notified" | "expired" | "declined";
  label: string;
  danger?: boolean;
}) {
  return (
    <form action={winnerOutcomeAction}>
      <Hidden releaseId={releaseId} raffleId={raffleId} />
      <input type="hidden" name="resultId" value={resultId} />
      <input type="hidden" name="outcome" value={outcome} />
      {danger ? (
        <ConfirmSubmitButton variant="dangerOutline" message={`Mark this person as ${label.toLowerCase()}? This can't be undone.`}>
          {label}
        </ConfirmSubmitButton>
      ) : (
        <Button type="submit" size="sm" variant="outline">
          {label}
        </Button>
      )}
    </form>
  );
}
