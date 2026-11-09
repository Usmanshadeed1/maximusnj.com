"use client";

import { useState, useTransition } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import type { ActionState } from "@/lib/action-result";
import { runMonthlyUpdateNowAction } from "@/server/actions/tier-awards";

/**
 * "Run the update now": completes this month's update right away.
 * Safe to press at any time — members who already have this month's tier are left alone.
 */
export function RunNowPanel({ label, emphasise }: { label: string; emphasise?: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState>({});

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button
          size="lg"
          variant={emphasise ? "default" : "outline"}
          disabled={isPending}
          aria-busy={isPending}
          onClick={() =>
            startTransition(async () => {
              setResult({});
              setResult(await runMonthlyUpdateNowAction());
            })
          }
        >
          {isPending ? <Loader2 aria-hidden className="animate-spin" /> : <Play aria-hidden />}
          {isPending ? "Running…" : label}
        </Button>
      </div>
      <FormMessage state={result} />
    </div>
  );
}
