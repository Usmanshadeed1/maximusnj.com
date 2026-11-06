/**
 * Shown instantly while a staff page loads, so every click gets immediate feedback.
 * The sidebar and top bar stay in place; only the page area shows this placeholder.
 */
export default function StaffPageLoading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <div className="h-7 w-48 rounded-md bg-muted" />
          <div className="h-4 w-72 max-w-full rounded-md bg-muted" />
        </div>
        <div className="hidden h-11 w-40 rounded-md bg-muted sm:block" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="h-12 rounded-lg bg-muted" />
        <div className="rounded-xl border bg-card p-5">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex items-center gap-4 border-b py-4 last:border-0">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-4 flex-1 rounded bg-muted" />
              <div className="hidden h-4 w-32 rounded bg-muted sm:block" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
