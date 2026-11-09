import { Download, FlagTriangleRight, Mail, PhoneCall, Send, SkipForward } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { formatBusinessDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  completeRaffleAction,
  nextInLineAction,
  notifyWinnersAction,
  resendEmailsAction,
  winnerOutcomeAction,
} from "@/server/actions/raffle-results";
import type { ResultView } from "@/server/raffles";
import type { WinnerOutcome } from "@/types/database";
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

/** The ranked list after the draw, with everything staff do to winners (§10.4 to §10.6). */
export function ResultsCard({
  releaseId,
  raffleId,
  results,
  winnerCount,
  completed,
  canManage,
  stores,
  defaultStoreId,
  emailReady,
}: {
  releaseId: string;
  raffleId: string;
  results: ResultView[];
  winnerCount: number;
  completed: boolean;
  canManage: boolean;
  stores: { id: string; name: string }[];
  defaultStoreId: string;
  emailReady: boolean;
}) {
  const live = results.filter((r) => r.isWinner && ["pending", "notified", "claimed"].includes(r.outcome)).length;
  const hasMoreOnList = results.some((r) => !r.isWinner);
  const canPromote = !completed && live < winnerCount && hasMoreOnList;
  const unTold = results.filter((r) => r.isWinner && r.outcome === "pending" && r.notifyState === null).length;
  const emailsWaiting = results.some((r) => r.email && r.email.status !== "sent" && r.outcome === "notified");
  const unresolved = results.some((r) => r.isWinner && ["pending", "notified"].includes(r.outcome));

  return (
    <Card className="mt-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-brand-navy-deep">Draw results</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {results.length} {results.length === 1 ? "person" : "people"} ranked. Winners are highlighted.
          </p>
        </div>
        {canManage && (
          <a href={`/staff/raffles/${releaseId}/${raffleId}/export`} className="inline-flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm font-semibold hover:bg-muted">
            <Download aria-hidden className="size-4" /> Export CSV
          </a>
        )}
      </div>

      {!completed && (
        <div className="mt-5 grid gap-3 rounded-xl bg-muted/60 p-4 sm:grid-cols-2">
          {canManage && (
            <form action={notifyWinnersAction} className="flex flex-col gap-2">
              <Hidden releaseId={releaseId} raffleId={raffleId} />
              <label htmlFor="notify-count" className="text-sm font-semibold">
                Tell winners
              </label>
              <div className="flex gap-2">
                <Input id="notify-count" name="count" type="number" min={1} max={10000} defaultValue={Math.max(unTold, 1)} className="w-24" aria-describedby="notify-help" />
                <Button type="submit" disabled={unTold === 0}>
                  <Send aria-hidden /> Notify
                </Button>
              </div>
              <p id="notify-help" className="text-xs text-muted-foreground">
                {unTold === 0
                  ? "Every winner has been looked at."
                  : `${unTold} winner${unTold === 1 ? " is" : "s are"} waiting to be told. Only methods the raffle allows and the member chose are used.`}
                {!emailReady && " Email isn't set up yet, so emails will wait."}
              </p>
            </form>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">A winner can&apos;t collect?</p>
            <div className="flex flex-wrap gap-2">
              <form action={nextInLineAction}>
                <Hidden releaseId={releaseId} raffleId={raffleId} />
                <Button type="submit" variant="outline" disabled={!canPromote}>
                  <SkipForward aria-hidden /> Next in line
                </Button>
              </form>
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
              Mark a winner as expired or declined, then press Next in line. The same list is used, with no new draw.
            </p>
          </div>
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
                  ) : (
                    <span className="text-xs text-muted-foreground">Next on the list</span>
                  )}
                </div>
              </div>

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
        <ConfirmSubmitButton variant="dangerOutline" message={`Mark this winner as ${label.toLowerCase()}? This can't be undone.`}>
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
