export function SearchBox({ defaultValue = "", autoFocus = false, size = "lg" }: { defaultValue?: string; autoFocus?: boolean; size?: "lg" | "md" }) {
  const big = size === "lg";
  return (
    <form action="/stocks" className={`flex w-full items-center gap-2 rounded-full border border-line bg-surface p-1.5 shadow-[0_1px_2px_rgb(15_23_42/0.04)] focus-within:border-ink/30 ${big ? "max-w-xl" : "max-w-md"}`}>
      <svg viewBox="0 0 20 20" className="ml-4 size-5 shrink-0 text-muted" aria-hidden>
        <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="m13.5 13.5 3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        name="q"
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="Try Apple, Tesla or S&P 500"
        aria-label="Search for a company"
        className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/70 ${big ? "py-2.5 text-base" : "py-1.5 text-sm"}`}
      />
      <button type="submit" className={`rounded-full bg-ink font-medium text-white transition hover:bg-ink/85 ${big ? "px-6 py-3 text-sm" : "px-4 py-2 text-sm"}`}>
        Search
      </button>
    </form>
  );
}
