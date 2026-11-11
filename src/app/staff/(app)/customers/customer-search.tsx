"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";

const DEBOUNCE_MS = 250;

/**
 * Live search: results update as you type (debounced). Pressing Enter — which is what a
 * barcode scanner does after typing the member number — opens an exact match directly.
 */
export function CustomerSearch({
  initialQuery,
  basePath = "/staff/customers",
}: {
  initialQuery: string;
  /** The page the results are shown on. */
  basePath?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef(initialQuery);

  const navigate = (query: string, open: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    lastSent.current = query;
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (open && query) params.set("open", "1");
    const href = params.size ? `${basePath}?${params}` : basePath;
    startTransition(() => router.replace(href, { scroll: false }));
  };

  // Search shortly after the user stops typing.
  useEffect(() => {
    const query = value.trim();
    if (query === lastSent.current) return;
    timer.current = setTimeout(() => navigate(query, false), DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate is recreated each render; value drives this effect
  }, [value]);

  return (
    <form
      role="search"
      className="mb-5"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(value.trim(), true);
      }}
    >
      <label htmlFor="q" className="sr-only">
        Search customers
      </label>
      <div className="relative">
        {isPending ? (
          <Loader2
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 animate-spin text-brand-blue"
          />
        ) : (
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
          />
        )}
        <input
          id="q"
          name="q"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Name, phone, email or member number"
          aria-busy={isPending}
          className="h-12 w-full rounded-lg border border-input bg-white pr-11 pl-11 text-base shadow-xs transition-[border-color,box-shadow] placeholder:text-muted-foreground hover:border-brand-navy/60 focus-visible:border-brand-blue focus-visible:ring-4 focus-visible:ring-brand-blue/20 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setValue("");
              navigate("", false);
            }}
            className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </form>
  );
}
