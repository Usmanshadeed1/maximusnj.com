import { Logo } from "@/components/brand/logo";
import { TierBadge } from "@/components/tier-badge";
import { cn } from "@/lib/utils";
import { Barcode } from "./barcode";

/**
 * The physical/digital member card (credit-card shape, 85.6 × 54 mm).
 * Everything inside is sized relative to the card width (container query units),
 * so it looks identical as a small preview and when printed at real size.
 */
export function MemberCard({
  name,
  memberNumber,
  className,
}: {
  name: string;
  memberNumber: string;
  className?: string;
}) {
  return (
    <div className={cn("@container w-full", className)}>
      <div
        className="relative flex aspect-[85.6/54] w-full flex-col justify-between overflow-hidden rounded-[4.5cqw] bg-gradient-to-br from-brand-blue via-brand-navy to-brand-navy-deep p-[5cqw] text-white shadow-xl ring-1 ring-white/10"
        style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-[30cqw] -right-[20cqw] size-[60cqw] rounded-full bg-brand-blue/40 blur-2xl"
        />
        <div className="relative flex items-start justify-between">
          <Logo className="w-[34cqw]" />
          <TierBadge tier="base" className="px-[2.4cqw] py-[0.8cqw] text-[2.6cqw]" />
        </div>
        <div className="relative">
          <p className="truncate text-[4.4cqw] leading-tight font-bold">{name}</p>
          <div className="mt-[2cqw] rounded-[2cqw] bg-white px-[3cqw] pt-[2cqw] pb-[1.2cqw]">
            <Barcode value={memberNumber} className="h-[11cqw]" />
            <p className="mt-[0.6cqw] text-center font-mono text-[3.2cqw] font-semibold tracking-[0.35em] text-black">
              {memberNumber}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
