import { cn } from "@/lib/utils";

/** A slim progress bar toward the next tier. `value` is 0 to 1; anything outside is clamped. */
export function TierProgress({ value, label, className }: { value: number; label: string; className?: string }) {
  const percent = Math.round(Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("h-3 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-blue to-brand-yellow transition-[width] duration-700 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
