import Link from "next/link";
import { formatUsd } from "@/lib/format";
import type { StockSummary, TokenState } from "@/lib/stock";
import { SpotlightLink } from "./spotlight";

export function StockLogo({ stock, size = 40 }: { stock: { logoUrl: string | null; ticker: string }; size?: number }) {
  if (stock.logoUrl) {
    return (
      <img
        src={stock.logoUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full border border-line bg-surface object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-bg font-mono text-[0.65rem] font-medium text-muted"
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
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted">
      <span className={`size-1.5 rounded-full ${TONE[state.tone]}`} />
      {state.label}
    </span>
  );
}

export function StockCard({ stock }: { stock: StockSummary }) {
  return (
    <SpotlightLink
      href={`/stocks/${stock.ticker}`}
      className="group flex h-full flex-col gap-5 rounded-card border border-line bg-surface p-5 transition duration-300 hover:-translate-y-1 hover:border-ink/15 hover:shadow-[0_18px_40px_-20px_rgb(15_23_42/0.25)]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="transition duration-500 group-hover:rotate-[-8deg] group-hover:scale-110">
          <StockLogo stock={stock} />
        </span>
        {stock.state && <StatePill state={stock.state} />}
      </div>
      <div>
        <p className="line-clamp-1 font-medium">{stock.name}</p>
        <p className="mt-0.5 font-mono text-xs text-muted">{stock.ticker}</p>
      </div>
      <div className="mt-auto flex items-end justify-between">
        <p className="text-xl font-medium">{formatUsd(stock.price)}</p>
        <span className="flex items-center gap-1 text-xs text-muted">
          {stock.from1 && "from $1"}
          <Arrow className="size-3.5 -translate-x-1 opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
        </span>
      </div>
    </SpotlightLink>
  );
}

export function StockRow({ stock }: { stock: StockSummary }) {
  return (
    <Link href={`/stocks/${stock.ticker}`} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-bg">
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
