import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** Use "light" on dark (navy) backgrounds. */
  tone?: "light" | "dark";
}

/** Text wordmark placeholder until the owner supplies the official logo file. */
export function Logo({ className, tone = "dark" }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="grid size-9 place-items-center rounded-lg bg-brand-yellow text-lg font-black text-brand-navy-deep shadow-sm"
      >
        M
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "text-base font-extrabold tracking-[0.14em]",
            tone === "light" ? "text-white" : "text-brand-navy",
          )}
        >
          MAXIMUS
        </span>
        <span
          className={cn(
            "text-[10px] font-semibold tracking-[0.32em]",
            tone === "light" ? "text-brand-yellow" : "text-brand-blue",
          )}
        >
          COLLECTIBLES
        </span>
      </span>
    </span>
  );
}
