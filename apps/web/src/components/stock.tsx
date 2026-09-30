import Link from "next/link";
import { formatUsd } from "@/lib/format";
import type { StockSummary, TokenState } from "@/lib/stock";

export function StockLogo({ stock, size = 40 }: { stock: { logoUrl: string | null; ticker: string }; size?: number }) {
  if (stock.logoUrl) {
    return (
      <img
        src={stock.logoUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full bg-surface object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface font-mono text-2xs font-medium text-muted"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {stock.ticker.slice(0, 4)}
    </span>
  );
}

const TONE: Record<TokenState["tone"], string> = {
  open: "bg-gain",
  warn: "bg-warn",
  paused: "bg-loss",
  closed: "bg-muted/50",
};

export function StatePill({ state }: { state: TokenState }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-muted">
      <span className={`size-1.5 rounded-full ${TONE[state.tone]}`} />
      {state.label}
    </span>
  );
}

export function StockCard({ stock }: { stock: StockSummary }) {
  return (
    <Link
      href={`/stocks/${stock.ticker}`}
      className="group flex h-full min-h-56 flex-col rounded-card bg-card p-4 transition duration-300 hover:-translate-y-1 hover:bg-card-hover sm:min-h-64 sm:p-5"
    >
      <div className="flex items-start justify-between gap-2">
        {stock.state ? (
          <span className="flex items-center gap-1.5 text-xs font-medium sm:text-sm">
            <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${TONE[stock.state.tone]}`} />
            {stock.state.label}
          </span>
        ) : (
          <span />
        )}
        <span className="shrink-0 transition duration-500 group-hover:-rotate-8 group-hover:scale-110">
          <StockLogo stock={stock} size={32} />
        </span>
      </div>
      <p className="my-auto py-6 text-center text-[clamp(1.5rem,2.6vw,2.1rem)] font-semibold tracking-[-0.05em]">
        {formatUsd(stock.price)}
      </p>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{stock.name}</p>
          <p className="font-mono text-xs text-muted">{stock.ticker}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
          {stock.from1 && "from $1"}
          <Arrow className="size-3.5 -translate-x-1 opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
        </span>
      </div>
    </Link>
  );
}

export function StockRow({ stock }: { stock: StockSummary }) {
  return (
    <Link href={`/stocks/${stock.ticker}`} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-card">
      <StockLogo stock={stock} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{stock.name}</p>
        <p className="font-mono text-xs text-muted">{stock.ticker}</p>
      </div>
      {stock.state && (
        <span className="hidden sm:block">
          <StatePill state={stock.state} />
        </span>
      )}
      <p className="w-28 text-right font-medium">{formatUsd(stock.price)}</p>
      <Arrow className="hidden size-4 text-muted transition group-hover:translate-x-1 group-hover:text-ink sm:block" />
    </Link>
  );
}

export function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
