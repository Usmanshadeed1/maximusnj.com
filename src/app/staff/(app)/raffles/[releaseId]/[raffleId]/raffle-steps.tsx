import { Check, Lock, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatBusinessDateTime } from "@/lib/format";
import type { RafflePhase } from "@/lib/raffles";
import { cn } from "@/lib/utils";
import { publishRaffleAction } from "@/server/actions/raffles";
import { closeEntriesAction } from "@/server/actions/raffle-results";
import { ConfirmSubmitButton, DrawDialog } from "./result-dialogs";

const STEPS = ["Draft", "Published", "Entries open", "Closed", "Drawn", "Done"] as const;
const STEP_OF: Record<Exclude<RafflePhase, "cancelled">, number> = { draft: 0, upcoming: 1, open: 2, closed: 3, drawn: 4, completed: 5 };

/**
 * Where the raffle is (Draft → Published → Entries open → Closed → Drawn → Done) and the one thing
 * to do next, with its button.
 */
export function RaffleSteps({
  releaseId,
  raffleId,
  phase,
  canManage,
  opensAt,
  closesAt,
  entries,
}: {
  releaseId: string;
  raffleId: string;
  phase: RafflePhase;
  canManage: boolean;
  opensAt: string;
  closesAt: string;
  entries: number;
}) {
  if (phase === "cancelled") return null;
  const current = STEP_OF[phase];
  const managerOnly = "The Owner or a Manager does this step.";

  let text: string;
  let action: React.ReactNode = null;
  switch (phase) {
    case "draft":
      text = "Check the details and products below, then press Publish. Members can't see the raffle until then.";
      if (canManage) {
        action = (
          <form action={publishRaffleAction}>
            <input type="hidden" name="releaseId" value={releaseId} />
            <input type="hidden" name="raffleId" value={raffleId} />
            <Button type="submit" size="lg" variant="accent">
              <Rocket aria-hidden /> Publish
            </Button>
          </form>
        );
      } else text += ` ${managerOnly}`;
      break;
    case "upcoming":
      text = `Published. Members can see it. Entries open on ${formatBusinessDateTime(opensAt)}.`;
      break;
    case "open":
      text = `Members are entering (${entries} so far). Entries close by themselves on ${formatBusinessDateTime(closesAt)}.`;
      if (canManage) {
        action = (
          <form action={closeEntriesAction}>
            <input type="hidden" name="releaseId" value={releaseId} />
            <input type="hidden" name="raffleId" value={raffleId} />
            <ConfirmSubmitButton variant="outline" size="lg" message="Close entries now? Nobody else can enter after this.">
              <Lock aria-hidden /> Close entries now
            </ConfirmSubmitButton>
          </form>
        );
      }
      break;
    case "closed":
      if (entries === 0) {
        text = "Entries are closed. Nobody entered, so there is nothing to draw.";
      } else {
        text = `Entries are closed (${entries} ${entries === 1 ? "person" : "people"}). Press Draw to put everyone in a random order.`;
        if (canManage) action = <DrawDialog releaseId={releaseId} raffleId={raffleId} />;
        else text += ` ${managerOnly}`;
      }
      break;
    case "drawn":
      text = "Go down the ranked list below from #1: press Pick, tell them, then mark what happened. Press Finish raffle when you're done.";
      break;
    case "completed":
      text = "This raffle is finished.";
      break;
  }

  return (
    <Card className="mt-6 p-5 sm:p-6">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3" aria-label="Raffle steps">
        {STEPS.map((label, i) => {
          const done = i < current || phase === "completed";
          const here = i === current && phase !== "completed";
          return (
            <li key={label} className="flex items-center gap-2" aria-current={here ? "step" : undefined}>
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                  done && "bg-success text-white",
                  here && "bg-brand-yellow text-brand-navy-deep ring-4 ring-brand-yellow/30",
                  !done && !here && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check aria-hidden className="size-4" /> : i + 1}
              </span>
              <span className={cn("text-sm", here ? "font-bold text-brand-navy-deep" : done ? "font-medium" : "text-muted-foreground")}>
                {label}
              </span>
              {i < STEPS.length - 1 && <span aria-hidden className="mx-1 h-px w-5 bg-border sm:w-8" />}
            </li>
          );
        })}
      </ol>
      <div className="mt-5 flex flex-col gap-4 rounded-xl bg-secondary/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-brand-blue uppercase">What to do next</p>
          <p className="mt-1 text-[15px]">{text}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </Card>
  );
}
