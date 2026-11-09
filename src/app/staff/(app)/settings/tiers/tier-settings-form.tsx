"use client";

import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, FlaskConical, Info, RotateCcw, Save } from "lucide-react";
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
  "flex cursor-pointer flex-col gap-1 rounded-lg border border-input bg-white px-4 py-3.5 transition-colors hover:border-brand-navy/60 has-checked:border-brand-blue has-checked:bg-secondary/60 has-checked:ring-2 has-checked:ring-brand-blue/20 has-disabled:cursor-not-allowed has-disabled:opacity-60";

type Props = {
  /** What the form starts with: the rules that apply next month. */
  initial: TierSettingsValues;
  /** e.g. "Dec 1, 2026" — when a save takes effect. */
  startsOn: string;
};

export function TierSettingsForm({ initial, startsOn }: Props) {
  const [state, formAction, isPending] = useActionState(saveTierRulesAction, idleState);
  const [values, setValues] = useState<TierSettingsValues>(initial);
  const [visitsOn, setVisitsOn] = useState(() => {
    const parsed = parseMoneyToCents(initial.visitValue, { allowZero: true });
    return parsed.ok ? parsed.cents > 0 : false;
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const errors = state.fieldErrors ?? {};
  const dirty = comparableFormValues(values) !== comparableFormValues(initial);
  const singleMonth = values.lookbackMonths.trim() === "1";
  const advancedHasError = Boolean(errors.lookbackMonths || errors.method || errors.carryOver);

  const set = <K extends keyof TierSettingsValues>(key: K, value: TierSettingsValues[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  // Warn before leaving the page with changes that haven't been saved.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

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

      {/* 1. Tiers */}
      <Section
        number={1}
        title="Your tiers"
        description="Give each level a name, and choose how much a member needs to reach it. A member reaches a tier once their points for the month are at least that amount."
      >
        <Ladder values={values} />
        <div className="mt-5 flex flex-col divide-y rounded-xl border">
          {TIERS.map((key) => (
            <TierRow key={key} tierKey={key} values={values} errors={errors} onChange={set} />
          ))}
        </div>
      </Section>

      {/* 2. Visits */}
      <Section
        number={2}
        title="Do store visits count?"
        description="Visits can give a member a small bonus on top of what they spend. Only one visit per day counts, so nobody can walk in and out to collect bonuses."
      >
        <input type="hidden" name="visitValue" value={values.visitValue} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={CHOICE_CARD}>
            <input
              type="radio"
              className="sr-only"
              checked={!visitsOn}
              onChange={() => {
                setVisitsOn(false);
                set("visitValue", "0.00");
              }}
            />
            <span className="text-base font-semibold">No — only spending counts</span>
            <span className="text-sm text-muted-foreground">A member&apos;s points are simply the money they spend.</span>
          </label>
          <label className={CHOICE_CARD}>
            <input
              type="radio"
              className="sr-only"
              checked={visitsOn}
              onChange={() => {
                setVisitsOn(true);
                const current = parseMoneyToCents(values.visitValue, { allowZero: true });
                if (!current.ok || current.cents === 0) set("visitValue", "5.00");
              }}
            />
            <span className="text-base font-semibold">Yes — each visit day adds a bonus</span>
            <span className="text-sm text-muted-foreground">Every different day a member checks in adds a bonus to their points.</span>
          </label>
        </div>
        {visitsOn && (
          <div className="mt-4 max-w-sm">
            <Field
              label="Bonus for each visit day"
              htmlFor="visit-bonus"
              error={errors.visitValue}
              hint={`For example, ${formatMoneyText(values.visitValue)} a day means 4 visit days add ${formatMoneyText(multiply(values.visitValue, 4))}.`}
            >
              <MoneyInput
                id="visit-bonus"
                name="visit-bonus-display"
                value={values.visitValue}
                onChange={(v) => set("visitValue", v)}
                invalid={Boolean(errors.visitValue)}
              />
            </Field>
          </div>
        )}
        {!visitsOn && errors.visitValue && <p className="mt-2 text-sm font-medium text-destructive">{errors.visitValue[0]}</p>}
        <p className="mt-4 rounded-lg bg-secondary/60 px-4 py-3 text-[15px] font-semibold text-brand-navy-deep">
          Points = money spent{visitsOn ? ` + ${formatMoneyText(values.visitValue)} × visit days` : ""}
        </p>
      </Section>

      {/* 3. Extra rules */}
      <Section
        number={3}
        title="Extra rules"
        description="These make sure a member can't reach a higher tier without really shopping with you."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckboxField
            name="requirePurchase"
            label="A member must buy something"
            description="Visiting alone is never enough — they must have spent money."
            checked={values.requirePurchase}
            onChange={(e) => set("requirePurchase", e.target.checked)}
          />
          <CheckboxField
            name="requireVisit"
            label="A member must visit the store"
            description="They must have checked in at least once."
            checked={values.requireVisit}
            onChange={(e) => set("requireVisit", e.target.checked)}
          />
        </div>
      </Section>

      <TryIt values={values} />

      {/* Advanced */}
      <details
        className="group rounded-xl border bg-card shadow-[0_1px_2px_rgba(11,31,58,0.04),0_8px_24px_rgba(11,31,58,0.06)]"
        open={advancedOpen || advancedHasError}
        onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}
      >
        <summary className="flex list-none items-center justify-between gap-4 p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-brand-navy-deep">Advanced options</h2>
            <p className="mt-0.5 text-[15px] text-muted-foreground">
              Most stores never need to change these. Right now: <strong className="text-foreground">{advancedSummary(values)}</strong>.
            </p>
          </div>
          <ChevronDown aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>

        <div className="flex flex-col gap-6 border-t p-5 sm:p-6">
          <div className="grid gap-5 sm:grid-cols-[14rem_1fr]">
            <Field
              label="Months to look back"
              htmlFor="lookbackMonths"
              error={errors.lookbackMonths}
              hint="Normally 1: the app looks at last month only. Enter 3 to look at the last 3 months."
            >
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
              <legend className="mb-1.5 text-[15px] font-semibold">When looking back more than one month</legend>
              <input type="hidden" name="method" value={values.method} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={CHOICE_CARD}>
                  <input type="radio" className="sr-only" checked={values.method === "average"} onChange={() => set("method", "average")} />
                  <span className="text-base font-semibold">Average</span>
                  <span className="text-sm text-muted-foreground">
                    The average over those months must reach the tier. One big month can make up for a quiet one.
                  </span>
                </label>
                <label className={CHOICE_CARD}>
                  <input type="radio" className="sr-only" checked={values.method === "every_month"} onChange={() => set("method", "every_month")} />
                  <span className="text-base font-semibold">Every month</span>
                  <span className="text-sm text-muted-foreground">
                    Each of those months must reach the tier on its own. Steadier, but stricter.
                  </span>
                </label>
              </div>
              {singleMonth && (
                <p className="mt-2 text-sm text-muted-foreground">With a 1-month look-back both choices give the same result.</p>
              )}
              {errors.method && <p className="mt-2 text-sm font-medium text-destructive">{errors.method[0]}</p>}
            </fieldset>
          </div>

          <div>
            <CheckboxField
              name="carryOver"
              label="Carry extra spending forward"
              description={
                singleMonth
                  ? "Spending above what a tier needs becomes credit for later months. For example, spending $50,000 when a tier needs $5,000 keeps a member in that tier for 10 months."
                  : "Only available when you look back 1 month."
              }
              checked={values.carryOver}
              disabled={!singleMonth}
              onChange={(e) => set("carryOver", e.target.checked)}
            />
            {errors.carryOver && <p className="mt-2 text-sm font-medium text-destructive">{errors.carryOver[0]}</p>}
          </div>
        </div>
      </details>

      {/* Save bar */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 px-4 py-3.5 shadow-lg backdrop-blur">
        <p className={cn("flex items-center gap-2 text-[15px]", dirty ? "font-semibold text-brand-navy-deep" : "text-muted-foreground")}>
          <span aria-hidden className={cn("size-2.5 rounded-full", dirty ? "bg-brand-yellow" : "bg-success")} />
          {dirty ? "You have unsaved changes" : "No unsaved changes"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!dirty || isPending} onClick={() => {
            setValues(initial);
            const parsed = parseMoneyToCents(initial.visitValue, { allowZero: true });
            setVisitsOn(parsed.ok ? parsed.cents > 0 : false);
          }}>
            <RotateCcw aria-hidden /> Discard
          </Button>
          <SubmitButton disabled={!dirty} pending={isPending} pendingText="Saving…">
            <Save aria-hidden /> Save — starts {startsOn}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------

function Section({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3.5">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-navy text-base font-bold text-white"
        >
          {number}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-brand-navy-deep">{title}</h2>
          <p className="mt-0.5 text-[15px] text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

function MoneyInput({
  id,
  name,
  value,
  onChange,
  invalid,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
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

/** "5" × 4 → "20.00" (text), or the original text when it isn't an amount. */
function multiply(text: string, times: number): string {
  const parsed = parseMoneyToCents(text, { allowZero: true });
  return parsed.ok ? (parsed.cents * times / 100).toFixed(2) : text;
}

function advancedSummary(values: TierSettingsValues): string {
  const months = values.lookbackMonths.trim();
  const base = months === "1" || months === "" ? "looking at last month only" : `looking at the last ${months} months (${values.method === "average" ? "average" : "every month"})`;
  return values.carryOver ? `${base}, carrying extra spending forward` : base;
}

/** The four tiers in a row, with the amount each needs — updates as you type. */
function Ladder({ values }: { values: TierSettingsValues }) {
  return (
    <ol className="flex flex-wrap items-start gap-x-2 gap-y-3" aria-label="Tier ladder">
      {TIERS.map((key, index) => (
        <li key={key} className="flex items-start gap-2">
          <div className="flex flex-col items-start gap-1">
            <TierBadge tier={key} label={values[`name_${key}` as const].trim() || "—"} className="px-3.5 py-1.5 text-sm" />
            <span className="pl-1 text-[15px] font-medium text-muted-foreground">
              {key === "base" ? "Everyone starts here" : formatMoneyText(values[`threshold_${key}` as `threshold_${"silver" | "gold" | "diamond"}`])}
            </span>
          </div>
          {index < TIERS.length - 1 && <ArrowRight aria-hidden className="mt-2 size-4 shrink-0 text-muted-foreground" />}
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
        <Field label={tierKey === "base" ? "Name of the first tier" : "Name"} htmlFor={nameKey} error={errors[nameKey]}>
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
            <p className="rounded-lg bg-muted px-3.5 py-3 text-[15px] text-muted-foreground">
              Everyone starts here, so it always needs <strong className="text-foreground">$0.00</strong>.
            </p>
          </div>
        ) : (
          <Field label="Reached at" htmlFor={thresholdKey} error={errors[thresholdKey]} hint="Points needed in a month">
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
      <Field
        label="What members get (optional)"
        htmlFor={benefitsKey}
        error={errors[benefitsKey]}
        hint="Shown to members in the customer portal, for example “5% off every purchase”."
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
    if (!Number.isInteger(months) || months < 1 || months > 24) return { error: "Set the months to look back (1 to 24) in Advanced options." };
    if (!spendCents.ok) return { error: "Enter an amount spent, like 540." };
    if (!/^\d{1,3}$/.test(visits.trim())) return { error: "Enter a number of visit days, like 4." };

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
      <div className="mb-4 flex items-start gap-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-brand-blue shadow-sm">
          <FlaskConical aria-hidden className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-brand-navy-deep">Try it out</h2>
          <p className="mt-0.5 text-[15px] text-muted-foreground">
            Type what a member spent and how many days they visited in a month. We&apos;ll show which tier that earns
            with the settings above. Nothing is saved.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Money spent in a month" htmlFor="try-spend">
          <MoneyInput id="try-spend" name="try-spend" value={spend} onChange={setSpend} />
        </Field>
        <Field label="Days visited in a month" htmlFor="try-visits">
          <Input id="try-visits" inputMode="numeric" value={visits} onChange={(e) => setVisits(e.target.value)} autoComplete="off" />
        </Field>
      </div>

      <div aria-live="polite" className="mt-5 rounded-xl border bg-white p-4 sm:p-5">
        {"error" in outcome ? (
          <p className="flex items-center gap-2 text-[15px] text-muted-foreground">
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
        <span className="text-base">They would earn</span>
        <TierBadge tier={result.tier} label={name(result.tier)} className="px-4 py-1.5 text-sm" />
      </div>
      <p className="text-[15px] text-muted-foreground">
        {formatCents(spendCents)} spent
        {rules.visitValueCents > 0
          ? ` + ${visitCount} ${visitCount === 1 ? "visit day" : "visit days"} × ${formatCents(rules.visitValueCents)}`
          : ""}{" "}
        = <strong className="text-foreground">{formatCents(monthlyPoints)}</strong> points
        {months > 1 ? ` a month, every month for ${months} months` : ""}.
      </p>
      {!result.requirementsMet && (
        <p className="text-[15px] font-medium text-amber-800">
          The points are there, but an extra rule isn&apos;t met (a purchase and/or a visit), so they stay at {name("base")}.
        </p>
      )}
      {progress.nextTier && progress.missingCents !== null && result.requirementsMet && (
        <p className="text-[15px] text-muted-foreground">
          To reach <strong className="text-foreground">{name(progress.nextTier)}</strong> they&apos;d need {formatCents(progress.missingCents)} more
          {progress.extraVisits !== null ? ` (about ${progress.extraVisits} more ${progress.extraVisits === 1 ? "visit day" : "visit days"})` : ""}.
        </p>
      )}
      {!progress.nextTier && result.requirementsMet && <p className="text-[15px] text-muted-foreground">That&apos;s the top tier.</p>}
    </div>
  );
}
