"use client";

import { useEffect } from "react";
import { Delete, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * PIN entry on an on-screen number pad (large touch buttons). Numbers only.
 *  - Shows one dot per digit (or the digits, if `revealed`), at least `minLength` slots.
 *  - A real keyboard works too (digits and Backspace), except while typing in another field.
 *  - `size="kiosk"` makes everything bigger for the entrance tablet.
 */
export function PinEntry({
  value,
  onChange,
  minLength = 6,
  maxLength = 12,
  disabled = false,
  revealed = false,
  size = "default",
  label = "PIN",
  invalid = false,
}: {
  value: string;
  onChange: (next: string) => void;
  minLength?: number;
  maxLength?: number;
  disabled?: boolean;
  revealed?: boolean;
  size?: "default" | "kiosk";
  label?: string;
  invalid?: boolean;
}) {
  const kiosk = size === "kiosk";

  useEffect(() => {
    if (disabled) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (/^[0-9]$/.test(event.key)) {
        if (value.length < maxLength) onChange(value + event.key);
      } else if (event.key === "Backspace") {
        onChange(value.slice(0, -1));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [disabled, value, maxLength, onChange]);

  const slots = Math.max(minLength, value.length);
  const press = (digit: string) => {
    if (!disabled && value.length < maxLength) onChange(value + digit);
  };
  const back = () => {
    if (!disabled) onChange(value.slice(0, -1));
  };

  const keyClass = cn(
    "grid place-items-center rounded-2xl border bg-white font-semibold text-brand-navy-deep shadow-xs transition select-none",
    "active:scale-95 active:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "disabled:pointer-events-none disabled:opacity-50",
    kiosk ? "h-20 text-4xl sm:h-24" : "h-16 text-2xl sm:h-[4.5rem]",
  );

  return (
    <div className="mx-auto w-full max-w-xs" role="group" aria-label={label}>
      <div
        role="status"
        aria-live="polite"
        aria-label={`${value.length} numbers entered`}
        className={cn("flex min-h-10 flex-wrap items-center justify-center gap-2.5", invalid && "animate-[pin-shake_0.35s_ease-in-out]")}
      >
        {Array.from({ length: slots }).map((_, i) => {
          const filled = i < value.length;
          return revealed && filled ? (
            <span
              key={i}
              className={cn("grid place-items-center font-bold tabular-nums text-brand-navy-deep", kiosk ? "size-10 text-3xl" : "size-8 text-2xl")}
            >
              {value[i]}
            </span>
          ) : (
            <span
              key={i}
              aria-hidden
              className={cn(
                "rounded-full border-2 transition-colors",
                kiosk ? "size-5" : "size-4",
                invalid ? "border-destructive" : "border-brand-navy/40",
                filled && (invalid ? "border-destructive bg-destructive" : "border-brand-blue bg-brand-blue"),
              )}
            />
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {KEYS.map((digit) => (
          <button key={digit} type="button" className={keyClass} onClick={() => press(digit)} disabled={disabled}>
            {digit}
          </button>
        ))}
        <button
          type="button"
          className={cn(keyClass, "border-transparent bg-transparent text-sm font-semibold text-muted-foreground shadow-none")}
          onClick={() => onChange("")}
          disabled={disabled || value.length === 0}
        >
          Clear
        </button>
        <button type="button" className={keyClass} onClick={() => press("0")} disabled={disabled}>
          0
        </button>
        <button
          type="button"
          aria-label="Delete last number"
          className={cn(keyClass, "border-transparent bg-transparent shadow-none")}
          onClick={back}
          disabled={disabled || value.length === 0}
        >
          <Delete aria-hidden className={kiosk ? "size-9" : "size-7"} />
        </button>
      </div>
    </div>
  );
}

/** A small "show / hide the numbers" switch for the PIN screen. */
export function RevealToggle({ revealed, onToggle }: { revealed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={revealed}
      className="mx-auto mt-4 inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      {revealed ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      {revealed ? "Hide numbers" : "Show numbers"}
    </button>
  );
}
