import { cn } from "@/lib/utils";

export type BarDatum = { label: string; value: number };

/**
 * A simple column chart that scales to any width (no chart library needed).
 * Screen readers get the same numbers as a table; sighted users get a hover/tap label on each bar.
 */
export function BarChart({
  title,
  data,
  format,
  emptyText = "Nothing in this period.",
  tone = "blue",
  className,
}: {
  title: string;
  data: BarDatum[];
  format: (value: number) => string;
  emptyText?: string;
  tone?: "blue" | "yellow";
  className?: string;
}) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const first = data[0]?.label;
  const last = data[data.length - 1]?.label;

  return (
    <figure className={cn("w-full", className)}>
      <figcaption className="sr-only">{title}</figcaption>
      {data.length === 0 || max <= 0 ? (
        <p className="grid h-40 place-items-center rounded-lg bg-muted/60 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <>
          <div role="img" aria-label={`${title}. Total ${format(total)}.`} className="flex h-40 items-end gap-[2px] sm:gap-1">
            {data.map((d) => (
              <div key={d.label} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${d.label}: ${format(d.value)}`}>
                <div
                  className={cn(
                    "w-full rounded-t-sm transition-opacity group-hover:opacity-75",
                    tone === "blue" ? "bg-brand-blue" : "bg-brand-yellow",
                  )}
                  style={{ height: `${Math.max(d.value > 0 ? 3 : 0, (d.value / max) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div aria-hidden className="mt-1.5 flex justify-between text-xs text-muted-foreground">
            <span>{first}</span>
            <span>{last}</span>
          </div>
          <table className="sr-only">
            <caption>{title}</caption>
            <tbody>
              {data.map((d) => (
                <tr key={d.label}>
                  <th scope="row">{d.label}</th>
                  <td>{format(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </figure>
  );
}

/** A horizontal bar with a label, for splits such as the tier distribution. */
export function ShareBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          <strong className="text-foreground">{value}</strong> · {percent}%
        </span>
      </div>
      <div role="img" aria-label={`${label}: ${value} of ${total}, ${percent}%`} className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: color }} />
      </div>
    </div>
  );
}
