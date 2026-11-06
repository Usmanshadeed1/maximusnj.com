import { Gem } from "lucide-react";
import { cn } from "@/lib/utils";

export type TierKey = "base" | "silver" | "gold" | "diamond";

const TIER_STYLES: Record<TierKey, string> = {
  base: "bg-tier-base/12 text-tier-base ring-tier-base/30",
  silver: "bg-gradient-to-r from-slate-100 to-slate-200 text-slate-700 ring-slate-300",
  gold: "bg-gradient-to-r from-amber-100 to-yellow-200 text-amber-800 ring-amber-300",
  diamond: "bg-gradient-to-r from-sky-100 to-cyan-100 text-sky-800 ring-sky-300",
};

const DEFAULT_NAMES: Record<TierKey, string> = {
  base: "Base",
  silver: "Silver",
  gold: "Gold",
  diamond: "Diamond",
};

/** Base is grey; on a dark background (e.g. the member card) it needs a light version to stay readable. */
const BASE_ON_DARK = "bg-white/15 text-white ring-white/40";

interface TierBadgeProps {
  tier: TierKey;
  /** Display name from the Owner's tier settings; falls back to the default name. */
  label?: string;
  /** Use "dark" when the badge sits on a navy/dark background. */
  tone?: "light" | "dark";
  className?: string;
}

/** The single, consistent tier badge used everywhere (PROJECT_SCOPE.md §3.4). */
export function TierBadge({ tier, label, tone = "light", className }: TierBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ring-1 ring-inset",
        tone === "dark" && tier === "base" ? BASE_ON_DARK : TIER_STYLES[tier],
        className,
      )}
    >
      <Gem aria-hidden className="size-3.5" />
      {label ?? DEFAULT_NAMES[tier]}
    </span>
  );
}
