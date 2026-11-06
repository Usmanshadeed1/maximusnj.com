import { encodeCode128B } from "@/lib/barcode/code128";
import { cn } from "@/lib/utils";

const QUIET_ZONE = 10; // blank modules on each side, required by scanners

/** Code 128 barcode as crisp SVG. Always draw it on a white background. */
export function Barcode({ value, className }: { value: string; className?: string }) {
  const widths = encodeCode128B(value);
  const bars: { x: number; width: number }[] = [];
  let x = QUIET_ZONE;
  widths.forEach((width, i) => {
    if (i % 2 === 0) bars.push({ x, width });
    x += width;
  });
  const total = x + QUIET_ZONE;

  return (
    <svg
      viewBox={`0 0 ${total} 40`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Barcode for ${value}`}
      className={cn("block h-12 w-full", className)}
    >
      {bars.map((bar) => (
        <rect key={bar.x} x={bar.x} y={0} width={bar.width} height={40} fill="#000" />
      ))}
    </svg>
  );
}
