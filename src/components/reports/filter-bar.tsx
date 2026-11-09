import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { PRESETS, type ReportFilters, filterQuery } from "@/lib/report-filters";
import { cn } from "@/lib/utils";

/**
 * Store + date range. It is a plain form, so it works on a phone and keeps the choice in the page address.
 * `showStore` is false when the person has only one store to choose from.
 */
export function FilterBar({
  basePath,
  filters,
  stores,
}: {
  basePath: string;
  filters: ReportFilters;
  stores: { id: string; name: string }[];
}) {
  return (
    <Card className="mb-6 p-4 sm:p-5">
      <form method="get" action={basePath} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        {stores.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="store" className="text-sm font-semibold">
              Store
            </label>
            <Select id="store" name="store" defaultValue={filters.storeId ?? ""}>
              <option value="">{stores.length > 1 ? "All my stores" : stores[0]?.name}</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Store</span>
            <p className="flex h-11 items-center text-[15px]">{stores[0]?.name ?? "—"}</p>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="from" className="text-sm font-semibold">
            From
          </label>
          <Input id="from" name="from" type="date" defaultValue={filters.from} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="to" className="text-sm font-semibold">
            To
          </label>
          <Input id="to" name="to" type="date" defaultValue={filters.to} required />
        </div>
        <Button type="submit" size="lg">
          Show
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Quick date ranges">
        {PRESETS.map((p) => (
          <Link
            key={p.key}
            href={`${basePath}?${filterQuery(filters, { preset: p.key })}`}
            aria-current={filters.preset === p.key ? "true" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors hover:bg-muted",
              filters.preset === p.key && "border-brand-blue bg-secondary text-brand-navy-deep",
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}

/** One headline number. */
export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 text-3xl font-extrabold tracking-tight text-brand-navy-deep tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </Card>
  );
}
