"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { formatUsd } from "@/lib/format";
import type { StockSummary } from "@/lib/stock";
import { StockLogo } from "./stock";

function SearchIcon({ spinning }: { spinning?: boolean }) {
  if (spinning) {
    return <span className="ml-5 size-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />;
  }
  return (
    <svg viewBox="0 0 20 20" className="ml-4 size-5 shrink-0 text-muted" aria-hidden>
      <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m13.5 13.5 3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function useSlashToFocus(ref: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key !== "/" || target.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref]);
}

const PLACEHOLDERS = ["Apple", "Tesla", "S&P 500", "Nvidia", "Netflix", "Gold"];

function useCyclingPlaceholder() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % PLACEHOLDERS.length), 2200);
    return () => clearInterval(id);
  }, []);
  return `Try ${PLACEHOLDERS[i]}`;
}

export function HeroSearch() {
  const router = useRouter();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<StockSummary[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const placeholder = useCyclingPlaceholder();
  useSlashToFocus(input);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResults([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        const data = (await res.json()) as { results: StockSummary[] };
        setFailed(!res.ok);
        setResults(data.results);
        setActive(0);
        setLoading(false);
      } catch {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 120);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q]);

  const go = (ticker?: string) => {
    if (ticker) router.push(`/stocks/${ticker}`);
    else if (q.trim()) router.push(`/stocks?q=${encodeURIComponent(q.trim())}`);
  };

  const showPanel = open && q.trim().length > 0;

  return (
    <div className="relative w-full max-w-xl text-left">
      <div className="flex items-center gap-2 rounded-full border border-line bg-surface p-1.5 shadow-soft transition focus-within:border-ink/25 focus-within:shadow-focus">
        <SearchIcon spinning={loading} />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(results[active]?.ticker);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search for a company"
          autoComplete="off"
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none placeholder:text-muted/70"
        />
        <kbd className="mr-3 hidden rounded-md border border-line px-2 py-0.5 font-mono text-xs text-muted sm:block">/</kbd>
      </div>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-3xl border border-line bg-surface p-2 shadow-panel"
        >
          {results.length === 0 && !loading && (
            <p className="px-4 py-5 text-sm text-muted">
              {failed ? "We couldn't reach market data. Try again in a moment." : <>No company called &ldquo;{q.trim()}&rdquo; yet.</>}
            </p>
          )}
          {results.map((s, i) => (
            <Link
              key={s.ticker}
              href={`/stocks/${s.ticker}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 transition ${i === active ? "bg-bg" : ""}`}
            >
              <StockLogo stock={s} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.name}</p>
                <p className="font-mono text-xs text-muted">{s.ticker}</p>
              </div>
              <p className="font-medium">{formatUsd(s.price)}</p>
            </Link>
          ))}
          {results.length > 0 && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go()}
              className="mt-1 w-full rounded-2xl px-3 py-2.5 text-left text-sm text-muted transition hover:bg-bg hover:text-ink"
            >
              See all results for &ldquo;{q.trim()}&rdquo; →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function LiveSearch({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(defaultValue);
  const [pending, startTransition] = useTransition();
  const placeholder = useCyclingPlaceholder();
  useSlashToFocus(input);

  useEffect(() => {
    if (q.trim() === (params.get("q") ?? "")) return;
    const id = setTimeout(() => {
      const next = q.trim() ? `${pathname}?q=${encodeURIComponent(q.trim())}` : pathname;
      startTransition(() => router.replace(next, { scroll: false }));
    }, 180);
    return () => clearTimeout(id);
  }, [q, params, pathname, router]);

  return (
    <div className="flex w-full max-w-md items-center gap-2 rounded-full border border-line bg-surface p-1.5 transition focus-within:border-ink/25 focus-within:shadow-focus">
      <SearchIcon spinning={pending} />
      <input
        ref={input}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={!defaultValue}
        autoComplete="off"
        aria-label="Search for a company"
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted/70"
      />
      {q ? (
        <button onClick={() => setQ("")} className="mr-2 rounded-full px-3 py-1 text-xs text-muted transition hover:bg-bg hover:text-ink">
          Clear
        </button>
      ) : (
        <kbd className="mr-3 rounded-md border border-line px-2 py-0.5 font-mono text-xs text-muted">/</kbd>
      )}
    </div>
  );
}
