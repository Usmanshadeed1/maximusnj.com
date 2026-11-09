"use client";

import { startTransition, useActionState } from "react";
import { FlaskConical } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Field, FormMessage, Select, SubmitButton } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { runTestUpdateAction } from "@/server/actions/tier-awards";

/**
 * Test tools: pretend a month just ended, to watch tiers being decided without waiting for the 1st.
 * Only shown when the site's test tools are switched on. Results are marked "Test" and replaced
 * automatically when the real update runs.
 */
export function TestToolsCard({ options }: { options: { value: string; label: string }[] }) {
  const [state, formAction, isPending] = useActionState(runTestUpdateAction, idleState);

  return (
    <Card className="border-2 border-dashed border-amber-400 bg-amber-50/60 p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-amber-600 shadow-sm">
          <FlaskConical aria-hidden className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-bold text-brand-navy-deep">Test tools — only on this test site</h2>
          <p className="mt-0.5 text-[15px] text-muted-foreground">
            Pretend a month has just ended and watch members get their tier. These results are marked{" "}
            <strong>Test</strong>, and the real update replaces them automatically.
          </p>
        </div>
      </div>

      <ol className="mb-5 flex list-decimal flex-col gap-1 pl-5 text-[15px]">
        <li>Record a purchase and a check-in for a member.</li>
        <li>Choose a month below and press the button.</li>
        <li>Open that member. Their “Monthly tiers” list shows the result.</li>
      </ol>

      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          startTransition(() => formAction(formData));
        }}
      >
        <FormMessage state={state} />
        <Field label="Which month's tier should be decided?" htmlFor="test-month" error={state.fieldErrors?.month}>
          <Select id="test-month" name="month" defaultValue={options[0]?.value}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <SubmitButton size="lg" variant="accent" pending={isPending} pendingText="Running the test…">
            Run month-end test
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
