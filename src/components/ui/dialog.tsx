"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type DialogContextValue = { open: () => void; close: () => void };
const DialogContext = React.createContext<DialogContextValue | null>(null);

export function useDialog(): DialogContextValue {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used inside <Dialog>");
  return ctx;
}

/**
 * Accessible modal built on the native <dialog> element (focus trap, Esc to close).
 * `trigger` receives an `open` function; children can call `useDialog().close()`.
 */
export function Dialog({
  title,
  description,
  trigger,
  children,
  className,
}: {
  title: string;
  description?: string;
  trigger: (open: () => void) => React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  const [isOpen, setIsOpen] = React.useState(false);
  const value = React.useMemo<DialogContextValue>(
    () => ({ open: () => setIsOpen(true), close: () => setIsOpen(false) }),
    [],
  );

  // Keep the native <dialog> in sync with React state.
  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <DialogContext value={value}>
      {trigger(value.open)}
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={() => setIsOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) value.close();
        }}
        className={cn(
          // text-left: a dialog must never inherit alignment from where its trigger sits (e.g. a right-aligned table cell).
          "m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border bg-card p-0 text-left text-card-foreground shadow-2xl backdrop:bg-brand-navy-deep/50 backdrop:backdrop-blur-[2px]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={value.close}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>
        {/* Remount content each time it opens so forms start fresh. */}
        <div className="px-6 py-5">{isOpen ? children : null}</div>
      </dialog>
    </DialogContext>
  );
}
