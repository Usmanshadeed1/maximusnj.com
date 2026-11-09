"use client";

import { ArrowUp, ImageIcon, Plus, X } from "lucide-react";
import { addChoice, moveChoiceUp, ordinal, removeChoice } from "@/lib/choices";
import { cn } from "@/lib/utils";

export type PickerProduct = { id: string; name: string; description?: string | null; imageUrl?: string | null };

/**
 * Put products in order: tap a product to add it as the next choice; reorder with the arrow;
 * remove with ×. When `name` is given, the order is also sent with the form (one hidden field per choice, in order).
 */
export function ChoicePicker({
  products,
  value,
  onChange,
  name,
  orderedLabel = "Your choices, in order",
  availableLabel = "Tap to add",
  emptyText = "Tap the products you want, starting with the one you want most.",
  disabled = false,
}: {
  products: PickerProduct[];
  value: string[];
  onChange: (next: string[]) => void;
  name?: string;
  orderedLabel?: string;
  availableLabel?: string;
  emptyText?: string;
  disabled?: boolean;
}) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const chosen = value.filter((id) => byId.has(id));
  const left = products.filter((p) => !chosen.includes(p.id));

  return (
    <div className="flex flex-col gap-4">
      {name && chosen.map((id) => <input key={id} type="hidden" name={name} value={id} />)}

      <div>
        <p className="mb-2 text-sm font-semibold">{orderedLabel}</p>
        {chosen.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {chosen.map((id, index) => {
              const p = byId.get(id)!;
              return (
                <li key={id} className="flex items-center gap-3 rounded-xl border border-brand-blue/40 bg-secondary/60 px-3 py-2.5">
                  <span className="grid h-8 min-w-12 shrink-0 place-items-center rounded-full bg-brand-navy-deep px-2 text-xs font-bold text-white">
                    {ordinal(index + 1)}
                  </span>
                  <span className="min-w-0 flex-1 text-[15px] font-semibold">{p.name}</span>
                  <button
                    type="button"
                    onClick={() => onChange(moveChoiceUp(chosen, id))}
                    disabled={disabled || index === 0}
                    aria-label={`Move ${p.name} up`}
                    className="grid size-9 place-items-center rounded-full text-brand-navy-deep hover:bg-white disabled:opacity-30"
                  >
                    <ArrowUp aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(removeChoice(chosen, id))}
                    disabled={disabled}
                    aria-label={`Remove ${p.name}`}
                    className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-white hover:text-destructive"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {left.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">{availableLabel}</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {left.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onChange(addChoice(chosen, p.id))}
                  disabled={disabled}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border bg-white px-3 py-2.5 text-left transition hover:border-brand-blue hover:bg-secondary/40",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                >
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- product pictures are any web address
                    <img src={p.imageUrl} alt="" className="size-10 shrink-0 rounded-md border object-cover" />
                  ) : (
                    <span className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary text-brand-blue">
                      <ImageIcon aria-hidden className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{p.name}</span>
                    {p.description && <span className="block truncate text-xs text-muted-foreground">{p.description}</span>}
                  </span>
                  <Plus aria-hidden className="size-4 shrink-0 text-brand-blue" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
