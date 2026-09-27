import type { Stock, StockToken } from "@firstshare/core";

export const COLLECTIONS = [
  {
    slug: "everyday",
    title: "Brands you use every day",
    blurb: "The phone in your pocket, the shows you stream, the car on the street.",
    tickers: ["AAPL", "AMZN", "NFLX", "TSLA", "META", "GOOGL", "MSFT", "COIN"],
  },
  {
    slug: "ai",
    title: "AI and chips",
    blurb: "The companies building the hardware and software behind AI.",
    tickers: ["NVDA", "AMD", "AVGO", "TSM", "MU", "ARM", "INTC", "PLTR"],
  },
  {
    slug: "market",
    title: "The whole market in one",
    blurb: "Funds that hold hundreds of companies at once. A common first buy.",
    tickers: ["SPY", "QQQ", "GLD", "IBIT"],
  },
] as const;

export function preferredToken(stock: Stock): StockToken | undefined {
  return stock.tokens.find((t) => t.platform === "bstock") ?? stock.tokens[0];
}

export function trades24x7(stock: Stock) {
  return stock.tokens.some((t) => t.platform === "bstock");
}

export const ISSUER = {
  bstock: { name: "bStocks", by: "Binance", note: "Trades around the clock, from $1." },
  ondo: { name: "Ondo", by: "Ondo Finance", note: "Wider choice. Usually $20 minimum, and it can cost more when New York is closed." },
} as const;

export type TokenState = { tone: "open" | "warn" | "paused" | "closed"; label: string };

const PAUSE_REASONS: Record<string, string> = {
  cash_dividend: "a dividend payout",
  stock_dividend: "a stock dividend",
  stock_split: "a stock split",
  merger: "a merger",
  acquisition: "an acquisition",
  spinoff: "a spin-off",
  maintenance: "maintenance",
};

export function tokenState(token: StockToken): TokenState {
  const s = token.status;
  if (s?.reasonCode === "ASSET_PAUSED") {
    return { tone: "paused", label: `Paused for ${PAUSE_REASONS[s.reasonMsg ?? ""] ?? "a company event"}` };
  }
  if (s?.reasonCode === "ASSET_LIMITED") return { tone: "warn", label: "Limited around earnings" };
  if (token.platform === "bstock") return { tone: "open", label: "Open 24/7" };
  if (s?.marketStatus === "regular") return { tone: "open", label: "Open" };
  if (s?.openState) return { tone: "warn", label: "Open, outside US hours" };
  return { tone: "closed", label: "Closed until New York opens" };
}

export interface StockSummary {
  ticker: string;
  name: string;
  logoUrl: string | null;
  price: number | null;
  state: TokenState | null;
  from1: boolean;
}

export function summarize(stock: Stock): StockSummary {
  const token = preferredToken(stock);
  return {
    ticker: stock.ticker,
    name: stock.name,
    logoUrl: stock.logoUrl,
    price: token?.price ?? null,
    state: token ? tokenState(token) : null,
    from1: trades24x7(stock),
  };
}

const FRIENDLY: Record<string, string> = {
  SPY: "S&P 500 fund",
  QQQ: "Nasdaq 100 fund",
  GLD: "gold fund",
  SLV: "silver fund",
  IBIT: "Bitcoin fund",
};

export function displayName(s: { ticker: string; name: string }) {
  return FRIENDLY[s.ticker] ?? shortName(s.name);
}

export function shortName(name: string) {
  return name.replace(/,?\s+(inc|corp|corporation|co|ltd|plc|holdings)\.?$/i, "").replace(/\.com$/i, "");
}
