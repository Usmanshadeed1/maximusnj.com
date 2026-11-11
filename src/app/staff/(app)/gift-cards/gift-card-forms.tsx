"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Link2, Loader2, Minus, Plus, Power, Search, UserRound, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { type ActionState, idleState } from "@/lib/action-result";
import {
  addToGiftCardAction,
  fixGiftCardAction,
  sellGiftCardAction,
  setGiftCardActiveAction,
  setGiftCardMemberAction,
  spendGiftCardAction,
  type MemberPick,
  searchMembersAction,
} from "@/server/actions/gift-cards";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function MoneyField({ name, label, hint, error, autoFocus }: { name: string; label: string; hint?: string; error?: string[]; autoFocus?: boolean }) {
  return (
    <Field label={label} htmlFor={name} error={error} hint={hint}>
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground">
          $
        </span>
        <Input id={name} name={name} inputMode="decimal" autoComplete="off" placeholder="0.00" className="h-12 pl-8 text-lg" autoFocus={autoFocus} />
      </div>
    </Field>
  );
}

/**
 * Find a member by name, phone, email or member number, and pick them.
 * The chosen member number is sent with the form (empty = nobody).
 */
function MemberField({
  name,
  label,
  hint,
  error,
  initial,
}: {
  name: string;
  label: string;
  hint: string;
  error?: string[];
  initial?: { number: string; name: string } | null;
}) {
  const [picked, setPicked] = useState<{ number: string; name: string } | null>(initial ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberPick[]>([]);
  const [searching, setSearching] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const run = ++latest.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      const found = await searchMembersAction(q).catch(() => []);
      if (run === latest.current) {
        setResults(found);
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const shown = query.trim().length >= 2 ? results : [];

  return (
    <Field label={label} htmlFor={`${name}-search`} error={error} hint={hint}>
      <input type="hidden" name={name} value={picked?.number ?? ""} />
      {picked ? (
        <div className="flex items-center gap-3 rounded-lg border bg-secondary/40 px-3.5 py-2.5">
          <UserRound aria-hidden className="size-5 shrink-0 text-brand-blue" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{picked.name}</p>
            <p className="font-mono text-xs text-muted-foreground">{picked.number}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setPicked(null)} aria-label={`Remove ${picked.name}`}>
            <X aria-hidden /> Remove
          </Button>
        </div>
      ) : (
        <div>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={`${name}-search`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              placeholder="Name, phone, email or member number"
              autoComplete="off"
              className="pl-10"
            />
            {searching && <Loader2 aria-hidden className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          {shown.length > 0 && (
            <ul className="mt-1.5 max-h-64 divide-y overflow-y-auto rounded-lg border bg-card shadow-sm">
              {shown.map((m) => (
                <li key={m.number}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked({ number: m.number, name: m.name });
                      setQuery("");
                      setResults([]);
                    }}
                    className="flex w-full flex-col items-start px-3.5 py-2.5 text-left hover:bg-muted/60"
                  >
                    <span className="text-[15px] font-semibold">{m.name}</span>
                    <span className="text-xs text-muted-foreground">{m.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim().length >= 2 && !searching && shown.length === 0 && (
            <p className="mt-1.5 text-sm text-muted-foreground">No member found.</p>
          )}
        </div>
      )}
    </Field>
  );
}

function useSubmit(action: Action) {
  const [state, formAction] = useActionState(action, idleState);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };
  return { state, onSubmit };
}

/** Sell a new gift card. */
export function SellGiftCardForm() {
  const { state, onSubmit } = useSubmit(sellGiftCardAction);
  const errors = state.fieldErrors ?? {};
  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
      <FormMessage state={state} />
      <Field
        label="Gift card number"
        htmlFor="code"
        error={errors.code}
        hint="Scan the gift card, or type the number on it. Leave it empty and the app makes one (like GC123456)."
      >
        <Input
          id="code"
          name="code"
          autoComplete="off"
          maxLength={40}
          className="h-12 font-mono text-lg uppercase"
          autoFocus
          onKeyDown={(e) => {
            // A scanner ends with Enter: go to the amount instead of sending the form.
            if (e.key === "Enter") {
              e.preventDefault();
              document.getElementById("amount")?.focus();
            }
          }}
        />
      </Field>
      <MoneyField name="amount" label="Amount on the card" error={errors.amount} />
      <MemberField
        name="paidBy"
        label="Who paid? (optional)"
        hint="If a member pays, it counts toward their tier, like a normal purchase."
        error={errors.paidBy}
      />
      <MemberField
        name="holder"
        label="Who is it for? (optional)"
        hint="They'll see the balance on their member page. Empty = the person who paid, or nobody."
        error={errors.holder}
      />
      <div className="flex justify-end">
        <SubmitButton size="lg" pendingText="Saving…">
          Sell gift card
        </SubmitButton>
      </div>
    </form>
  );
}

function DialogForm({
  action,
  cardId,
  submitLabel,
  destructive,
  children,
}: {
  action: Action;
  cardId: string;
  submitLabel: string;
  destructive?: boolean;
  children: (errors: Record<string, string[] | undefined>) => React.ReactNode;
}) {
  const { state, onSubmit } = useSubmit(action);
  const { close } = useDialog();
  useEffect(() => {
    if (state.ok) close();
  }, [state.ok, close]);
  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="cardId" value={cardId} />
      {children(state.fieldErrors ?? {})}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton variant={destructive ? "destructive" : "default"} pendingText="Saving…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Everything staff can do with one card. */
export function GiftCardActions({
  cardId,
  active,
  holderNumber,
  holderName,
}: {
  cardId: string;
  active: boolean;
  holderNumber: string | null;
  holderName: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Dialog
        title="Record spending"
        description="The customer pays with the gift card. This never counts toward a tier."
        trigger={(open) => (
          <Button size="lg" onClick={open} disabled={!active}>
            <Minus aria-hidden /> Record spending
          </Button>
        )}
      >
        <DialogForm action={spendGiftCardAction} cardId={cardId} submitLabel="Take it off the card">
          {(errors) => (
            <>
              <MoneyField name="amount" label="Amount spent" error={errors.amount} autoFocus />
            </>
          )}
        </DialogForm>
      </Dialog>

      <Dialog
        title="Add money"
        description="The customer puts more money on the card."
        trigger={(open) => (
          <Button size="lg" variant="outline" onClick={open} disabled={!active}>
            <Plus aria-hidden /> Add money
          </Button>
        )}
      >
        <DialogForm action={addToGiftCardAction} cardId={cardId} submitLabel="Add to the card">
          {(errors) => (
            <>
              <MoneyField name="amount" label="Amount added" error={errors.amount} autoFocus />
              <MemberField
                name="paidBy"
                label="Who paid? (optional)"
                hint="If a member pays, it counts toward their tier."
                error={errors.paidBy}
              />
            </>
          )}
        </DialogForm>
      </Dialog>

      <Dialog
        title="Fix the balance"
        description="For mistakes only. Type what the balance should be. The reason is saved."
        trigger={(open) => (
          <Button size="lg" variant="outline" onClick={open}>
            <Wrench aria-hidden /> Fix balance
          </Button>
        )}
      >
        <DialogForm action={fixGiftCardAction} cardId={cardId} submitLabel="Save balance">
          {(errors) => (
            <>
              <MoneyField name="balance" label="Correct balance" error={errors.balance} autoFocus />
              <Field label="Reason" htmlFor="reason" error={errors.reason}>
                <Input id="reason" name="reason" maxLength={300} placeholder="e.g. Typed $50 instead of $5" required />
              </Field>
            </>
          )}
        </DialogForm>
      </Dialog>

      <Dialog
        title={holderNumber ? "Change the member" : "Connect to a member"}
        description="The member sees this card's balance on their member page. Remove the member to disconnect."
        trigger={(open) => (
          <Button size="lg" variant="outline" onClick={open}>
            <Link2 aria-hidden /> {holderNumber ? "Change member" : "Connect to member"}
          </Button>
        )}
      >
        <DialogForm action={setGiftCardMemberAction} cardId={cardId} submitLabel="Save">
          {(errors) => (
            <MemberField
              name="holder"
              label="Member"
              hint="Nobody picked = not connected to anyone."
              error={errors.holder}
              initial={holderNumber && holderName ? { number: holderNumber, name: holderName } : null}
            />
          )}
        </DialogForm>
      </Dialog>

      <Dialog
        title={active ? "Turn this card off?" : "Turn this card back on?"}
        description={active ? "For a lost or stolen card. Nobody can use it until it's turned on again. The money stays on it." : "The card can be used again."}
        trigger={(open) => (
          <Button size="lg" variant={active ? "dangerOutline" : "outline"} onClick={open}>
            <Power aria-hidden /> {active ? "Turn off" : "Turn on"}
          </Button>
        )}
      >
        <DialogForm action={setGiftCardActiveAction} cardId={cardId} submitLabel={active ? "Turn off" : "Turn on"} destructive={active}>
          {() => (
            <>
              <input type="hidden" name="active" value={active ? "false" : "true"} />
              <Field label="Reason (optional)" htmlFor="reason">
                <Input id="reason" name="reason" maxLength={300} placeholder={active ? "e.g. Customer lost it" : ""} />
              </Field>
            </>
          )}
        </DialogForm>
      </Dialog>
    </div>
  );
}
