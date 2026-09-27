import Link from "next/link";
import type { Stock } from "@firstshare/core";
import { formatUsd } from "@/lib/format";
import { preferredToken, tokenState, trades24x7, type TokenState } from "@/lib/stock";

export function StockLogo({ stock, size = 40 }: { stock: Pick<Stock, "logoUrl" | "ticker">; size?: number }) {
  if (stock.logoUrl) {
    return (
      <img src={stock.logoUrl} alt="" width={size} height={size} className="shrink-0 rounded-full border border-line bg-surface object-cover" style={{ width: size, height: size }} />
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-bg font-mono text-[0.7rem] font-medium text-muted"
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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted">
      <span className={`size-1.5 rounded-full ${TONE[state.tone]}`} />
      {state.label}
    </span>
  );
}

export function StockCard({ stock }: { stock: Stock }) {
  const token = preferredToken(stock);
  return (
    <Link
      href={`/stocks/${stock.ticker}`}
      className="group flex flex-col gap-5 rounded-card border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-12px_rgb(15_23_42/0.18)]"
    >
      <div className="flex items-start justify-between gap-3">
        <StockLogo stock={stock} />
        {token && <StatePill state={tokenState(token)} />}
      </div>
      <div>
        <p className="line-clamp-1 font-medium">{stock.name}</p>
        <p className="mt-0.5 font-mono text-xs text-muted">{stock.ticker}</p>
      </div>
      <div className="mt-auto flex items-end justify-between">
        <p className="text-xl font-medium">{formatUsd(token?.price)}</p>
        {trades24x7(stock) && <p className="text-xs text-muted">from $1</p>}
      </div>
    </Link>
  );
}

export function StockRow({ stock }: { stock: Stock }) {
  const token = preferredToken(stock);
  return (
    <Link href={`/stocks/${stock.ticker}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-bg">
      <StockLogo stock={stock} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{stock.name}</p>
        <p className="font-mono text-xs text-muted">{stock.ticker}</p>
      </div>
      {token && <span className="hidden sm:block"><StatePill state={tokenState(token)} /></span>}
      <p className="w-28 text-right font-medium">{formatUsd(token?.price)}</p>
    </Link>
  );
}
