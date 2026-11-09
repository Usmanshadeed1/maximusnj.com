"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { ArrowRight, FlaskConical, Info, RotateCcw, Save } from "lucide-react";
import { TierBadge } from "@/components/tier-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckboxField, Field, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { idleState } from "@/lib/action-result";
import { formatCents } from "@/lib/format";
import { parseMoneyToCents } from "@/lib/money";
import { type TierKey, type TierRules, calculateTier, progressToNextTier } from "@/lib/tier/engine";
import { comparableFormValues } from "@/lib/tier/form-values";
import { cn } from "@/lib/utils";
import type { TierSettingsValues } from "@/lib/validation/tier";
import { saveTierRulesAction } from "@/server/actions/tiers";

const TIERS: TierKey[] = ["base", "silver", "gold", "diamond"];
const CHOICE_CARD =
  "flex cursor-pointer flex-col gap-0.5 rounded-lg border border-input bg-white px-4 py-3 transition-colors hover:border-brand-navy/60 has-checked:border-brand-blue has-checked:bg-secondary/60 has-checked:ring-2 has-checked:ring-brand-blue/20 has-disabled:cursor-not-allowed has-disabled:opacity-60";

type Props = {
  /** What the form starts with: the rules that apply next month. */
  initial: TierSettingsValues;
  /** e.g. "Dec 1, 2026" — when a save takes effect. */
  startsOn: string;
};

export function TierSettingsForm({ initial, startsOn }: Props) {
  const [state, formAction, isPending] = useActionState(saveTierRulesAction, idleState);
  const [values, setValues] = useState<TierSettingsValues>(initial);
  const errors = state.fieldErrors ?? {};
  const dirty = comparableFormValues(values) !== comparableFormValues(initial);

  const set = <K extends keyof TierSettingsValues>(key: K, value: TierSettingsValues[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const singleMonth = values.lookbackMonths.trim() === "1";

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        // Submit manually so React doesn't clear the form when there is something to fix.
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      <FormMessage state={state} />

      {/* Tiers */}
      <Card className="p-5 sm:p-6">
        <SectionHeading
          title="Tiers"
          description="Name each tier and say how many points a member needs to reach it. Everyone starts at the first tier."
        />
        <Ladder values={values} />
        <div className="mt-5 flex flex-col divide-y rounded-xl border">
          {TIERS.map((key) => (
            <TierRow key={key} tierKey={key} values={values} errors={errors} onChange={set} />
          ))}
        </div>
      </Card>

      {/* Points */}
      <Card className="p-5 sm:p-6">
        <SectionHeading
          title="Points"
          description="A member's points for a month are what they spent, plus a bonus for each day they visit."
        />
        <div className="mb-4 rounded-lg bg-secondary/60 px-4 py-3 text-sm font-semibold text-brand-navy-deep">
          Points = money spent + visits × <span className="text-brand-blue">{formatMoneyText(values.visitValue)}</span>
        </div>
        <div className="max-w-xs">
          <Field
            label="Value of one visit"
            htmlFor="visitValue"
            error={errors.visitValue}
            hint="Only one visit per day counts. Use $0 if visits shouldn't count."
          >
            <MoneyInput
              id="visitValue"
              name="visitValue"
              value={values.visitValue}
              onChange={(v) => set("visitValue", v)}
              invalid={Boolean(errors.visitValue)}
            />
          </Field>
        </div>
      </Card>

      {/* Look-back */}
      <Card className="p-5 sm:p-6">
        <SectionHeading
          title="How far back we look"
          description="Tiers are decided from recent months, not just the last one."
        />
        <div className="grid gap-5 sm:grid-cols-[12rem_1fr]">
          <Field label="Months to look back" htmlFor="lookbackMonths" error={errors.lookbackMonths} hint="1 to 24">
            <Input
              id="lookbackMonths"
              name="lookbackMonths"
              type="number"
              inputMode="numeric"
              min={1}
              max={24}
              value={values.lookbackMonths}
              onChange={(e) => {
                const next = e.target.value;
                setValues((previous) => ({
                  ...previous,
                  lookbackMonths: next,
                  // carry-over only works with a one-month look-back
                  carryOver: next.trim() === "1" ? previous.carryOver : false,
                }));
              }}
              aria-invalid={Boolean(errors.lookbackMonths)}
            />
          </Field>

          <fieldset disabled={singleMonth} className="min-w-0">
            <legend className="mb-1.5 text-sm font-semibold">When looking back more than a month</legend>
            <input type="hidden" name="method" value={values.method} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={CHOICE_CARD}>
                <input
                  type="radio"
                  className="sr-only"
                  checked={values.method === "average"}
                  onChange={() => set("method", "average")}
                />
                <span className="text-[15px] font-semibold">Average</span>
                <span className="text-xs text-muted-foreground">
                  The average points over those months must reach the tier. One big month can make up for a quiet one.
                </span>
              </label>
              <label className={CHOICE_CARD}>
                <input
                  type="radio"
                  className="sr-only"
                  checked={values.method === "every_month"}
                  onChange={() => set("method", "every_month")}
                />
                <span className="text-[15px] font-semibold">Every month</span>
                <span className="text-xs text-muted-foreground">
                  Each of those months must reach the tier on its own. Steadier, but stricter.
                </span>
              </label>
            </div>
            {singleMonth && (
              <p className="mt-2 text-xs text-muted-foreground">
                With a 1-month look-back both choices give the same result.
              </p>
            )}
            {errors.method && <p className="mt-2 text-xs font-medium text-destructive">{errors.method[0]}</p>}
          </fieldset>
        </div>

        <div className="mt-5">
          <CheckboxField
            name="carryOver"
            label="Carry extra spending forward"
            description={
              singleMonth
                ? "Spending beyond what a tier needs becomes credit for next month. $50,000 at a $5,000 tier is 10 months of that tier."
                : "Only available with a 1-month look-back."
            }
            checked={values.carryOver}
            disabled={!singleMonth}
            onChange={(e) => set("carryOver", e.target.checked)}
          />
          {errors.carryOver && <p className="mt-2 text-xs font-medium text-destructive">{errors.carryOver[0]}</p>}
        </div>
      </Card>

      {/* Requirements */}
      <Card className="p-5 sm:p-6">
        <SectionHeading
          title="Requirements"
          description="Rules a member must meet before they can rise above the first tier."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckboxField
            name="requirePurchase"
            label="Needs a purchase"
            description="Visits alone are never enough: they must have spent something."
            checked={values.requirePurchase}
            onChange={(e) => set("requirePurchase", e.target.checked)}
          />
          <CheckboxField
            name="requireVisit"
            label="Needs a visit"
            description="They must have checked in at least once."
            checked={values.requireVisit}
            onChange={(e) => set("requireVisit", e.target.checked)}
          />
        </div>
      </Card>

      <TryIt values={values} />

      {/* Save bar */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
        <p className={cn("flex items-center gap-2 text-sm", dirty ? "font-semibold text-brand-navy-deep" : "text-muted-foreground")}>
          <span aria-hidden className={cn("size-2.5 rounded-full", dirty ? "bg-brand-yellow" : "bg-success")} />
          {dirty ? "You have unsaved changes" : "No unsaved changes"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!dirty || isPending} onClick={() => setValues(initial)}>
            <RotateCcw aria-hidden /> Discard
          </Button>
          <SubmitButton disabled={!dirty} pending={isPending} pendingText="Saving…">
            <Save aria-hidden /> Save · takes effect {startsOn}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-bold text-brand-navy-deep">{title}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function MoneyInput({
  id,
  name,
  value,
  onChange,
  invalid,
  disabled,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground">
        $
      </span>
      <Input
        id={id}
        name={name}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        className="pl-8"
      />
    </div>
  );
}

/** "300" → "$300.00"; text that isn't an amount is shown as typed. */
function formatMoneyText(text: string): string {
  const parsed = parseMoneyToCents(text, { allowZero: true });
  return parsed.ok ? formatCents(parsed.cents) : text.trim() || "$0.00";
}

/** The four tiers in a row, with the points each needs — updates as you type. */
function Ladder({ values }: { values: TierSettingsValues }) {
  return (
    <ol className="flex flex-wrap items-start gap-x-2 gap-y-3" aria-label="Tier ladder">
      {TIERS.map((key, index) => (
        <li key={key} className="flex items-start gap-2">
          <div className="flex flex-col items-start gap-1">
            <TierBadge tier={key} label={values[`name_${key}` as const].trim() || "—"} />
            <span className="pl-1 text-xs font-medium text-muted-foreground">
              {key === "base" ? "Start here" : formatMoneyText(values[`threshold_${key}` as `threshold_${"silver" | "gold" | "diamond"}`])}
            </span>
          </div>
          {index < TIERS.length - 1 && <ArrowRight aria-hidden className="mt-1.5 size-4 shrink-0 text-muted-foreground" />}
        </li>
      ))}
    </ol>
  );
}

function TierRow({
  tierKey,
  values,
  errors,
  onChange,
}: {
  tierKey: TierKey;
  values: TierSettingsValues;
  errors: Record<string, string[] | undefined>;
  onChange: <K extends keyof TierSettingsValues>(key: K, value: TierSettingsValues[K]) => void;
}) {
  const nameKey = `name_${tierKey}` as const;
  const benefitsKey = `benefits_${tierKey}` as const;
  const thresholdKey = `threshold_${tierKey}` as `threshold_${"silver" | "gold" | "diamond"}`;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tierKey === "base" ? "First tier name" : "Tier name"} htmlFor={nameKey} error={errors[nameKey]}>
          <Input
            id={nameKey}
            name={nameKey}
            value={values[nameKey]}
            onChange={(e) => onChange(nameKey, e.target.value)}
            maxLength={30}
            autoComplete="off"
            aria-invalid={Boolean(errors[nameKey])}
          />
        </Field>
        {tierKey === "base" ? (
          <div className="flex flex-col justify-end">
            <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
              Everyone starts here, so it always needs <strong className="text-foreground">$0.00</strong>.
            </p>
          </div>
        ) : (
          <Field label="Points needed" htmlFor={thresholdKey} error={errors[thresholdKey]}>
            <MoneyInput
              id={thresholdKey}
              name={thresholdKey}
              value={values[thresholdKey]}
              onChange={(v) => onChange(thresholdKey, v)}
              invalid={Boolean(errors[thresholdKey])}
            />
          </Field>
        )}
      </div>
      <div>
        <Field
          label="Benefits (optional)"
          htmlFor={benefitsKey}
          error={errors[benefitsKey]}
          hint="Shown to members in the customer portal, e.g. “5% off every purchase”."
        >
          <Textarea
            id={benefitsKey}
            name={benefitsKey}
            rows={2}
            maxLength={500}
            value={values[benefitsKey]}
            onChange={(e) => onChange(benefitsKey, e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}

/** Type some activity and see which tier it would earn under the settings above — before saving anything. */
function TryIt({ values }: { values: TierSettingsValues }) {
  const [spend, setSpend] = useState("540");
  const [visits, setVisits] = useState("4");

  const outcome = useMemo(() => {
    const visitValue = parseMoneyToCents(values.visitValue, { allowZero: true });
    const silver = parseMoneyToCents(values.threshold_silver);
    const gold = parseMoneyToCents(values.threshold_gold);
    const diamond = parseMoneyToCents(values.threshold_diamond);
    const months = Number(values.lookbackMonths);
    const spendCents = parseMoneyToCents(spend, { allowZero: true });
    const visitCount = Number(visits);

    if (!visitValue.ok || !silver.ok || !gold.ok || !diamond.ok) return { error: "Fix the amounts above to try it." };
    if (!(silver.cents < gold.cents && gold.cents < diamond.cents)) return { error: "Each tier must need more than the one below it." };
    if (!Number.isInteger(months) || months < 1 || months > 24) return { error: "Set the months to look back (1–24)." };
    if (!spendCents.ok) return { error: "Enter an amount spent, like 540." };
    if (!/^\d{1,3}$/.test(visits.trim())) return { error: "Enter a number of visits, like 4." };

    const rules: TierRules = {
      visitValueCents: visitValue.cents,
      lookbackMonths: months,
      method: values.method === "every_month" ? "every_month" : "average",
      carryOver: values.carryOver && months === 1,
      requirePurchase: values.requirePurchase,
      requireVisit: values.requireVisit,
      thresholds: { silver: silver.cents, gold: gold.cents, diamond: diamond.cents },
    };
    const activity = Array.from({ length: months }, () => ({ spendCents: spendCents.cents, visits: visitCount }));
    return {
      rules,
      months,
      spendCents: spendCents.cents,
      visitCount,
      result: calculateTier(activity, rules),
      progress: progressToNextTier(activity, rules),
    };
  }, [values, spend, visits]);

  return (
    <Card className="border-brand-blue/30 bg-secondary/30 p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-brand-blue shadow-sm">
          <FlaskConical aria-hidden className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-bold text-brand-navy-deep">Try it</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            See which tier a member would earn with the settings above. Nothing is saved.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Spent in a month" htmlFor="try-spend">
          <MoneyInput id="try-spend" name="try-spend" value={spend} onChange={setSpend} />
        </Field>
        <Field label="Days they visited in a month" htmlFor="try-visits">
          <Input
            id="try-visits"
            inputMode="numeric"
            value={visits}
            onChange={(e) => setVisits(e.target.value)}
            autoComplete="off"
          />
        </Field>
      </div>

      <div aria-live="polite" className="mt-5 rounded-xl border bg-white p-4">
        {"error" in outcome ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info aria-hidden className="size-4 shrink-0" /> {outcome.error}
          </p>
        ) : (
          <TryItResult values={values} outcome={outcome} />
        )}
      </div>
    </Card>
  );
}

function TryItResult({
  values,
  outcome,
}: {
  values: TierSettingsValues;
  outcome: {
    rules: TierRules;
    months: number;
    spendCents: number;
    visitCount: number;
    result: ReturnType<typeof calculateTier>;
    progress: ReturnType<typeof progressToNextTier>;
  };
}) {
  const { rules, months, spendCents, visitCount, result, progress } = outcome;
  const name = (key: TierKey) => values[`name_${key}` as const].trim() || key;
  const monthlyPoints = spendCents + visitCount * rules.visitValueCents;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">They would earn</span>
        <TierBadge tier={result.tier} label={name(result.tier)} className="px-4 py-1.5 text-sm" />
      </div>
      <p className="text-sm text-muted-foreground">
        {formatCents(spendCents)} spent + {visitCount} {visitCount === 1 ? "visit" : "visits"} × {formatCents(rules.visitValueCents)} ={" "}
        <strong className="text-foreground">{formatCents(monthlyPoints)}</strong> points
        {months > 1 ? ` a month, every month for ${months} months` : ""}.
      </p>
      {!result.requirementsMet && (
        <p className="text-sm font-medium text-amber-700">
          The points are there, but a requirement isn&apos;t met (a purchase and/or a visit), so they stay at {name("base")}.
        </p>
      )}
      {progress.nextTier && progress.missingCents !== null && result.requirementsMet && (
        <p className="text-sm text-muted-foreground">
          To reach <strong className="text-foreground">{name(progress.nextTier)}</strong> they&apos;d need {formatCents(progress.missingCents)} more
          {progress.extraVisits !== null ? ` (about ${progress.extraVisits} more ${progress.extraVisits === 1 ? "visit" : "visits"})` : ""}.
        </p>
      )}
      {!progress.nextTier && result.requirementsMet && (
        <p className="text-sm text-muted-foreground">That&apos;s the top tier.</p>
      )}
    </div>
  );
}
