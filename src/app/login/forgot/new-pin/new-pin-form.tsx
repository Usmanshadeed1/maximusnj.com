"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { PinCapture } from "@/components/ui/pin-capture";
import { type ActionState, idleState } from "@/lib/action-result";
import { saveNewPinAction } from "@/server/actions/forgot-pin";

/** Type the new PIN twice, save, and you're logged in. */
export function NewPinForm() {
  const [pin, setPin] = useState("");
  const [state, setState] = useState<ActionState>(idleState);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-muted-foreground">6 to 12 numbers, typed twice. Keep it secret.</p>
      <FormMessage state={state} />
      <PinCapture value={pin} onChange={setPin} startLabel="Choose my new PIN" />
      <Button
        size="lg"
        className="w-full"
        disabled={!pin || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await saveNewPinAction(pin);
            // Only comes back when it didn't work (success opens the next page).
            if (result?.error) {
              setState(result);
              setPin("");
            }
          })
        }
      >
        {pending ? "Saving…" : "Save PIN and log in"}
      </Button>
    </div>
  );
}
