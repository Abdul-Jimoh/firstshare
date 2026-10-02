import type { W3Client } from "./binance/client.ts";
import { BSC, publicRwaListings, rwaPrices, rwaTokens } from "./binance/api.ts";
import type { MarketStatusInfo, PlatformId, PublicRwaListing, RwaToken } from "./binance/types.ts";

export interface StockToken {
  platform: PlatformId;
  symbol: string;
  address: string;
  decimals: number;
  sharesPerToken: number;
  logoUrl: string | null;
  status: MarketStatusInfo | null;
  price: number | null;
  source: "api" | "public";
}

export interface Stock {
  ticker: string;
  name: string;
  logoUrl: string | null;
  tokens: StockToken[];
}

const PLATFORM_ORDER: PlatformId[] = ["bstock", "ondo"];

function fromApi(t: RwaToken): StockToken {
  return {
    platform: t.platformId,
    symbol: t.tokenSymbol,
    address: t.tokenContractAddress.toLowerCase(),
    decimals: Number(t.decimals),
    sharesPerToken: Number(t.tokenToShareRatio),
    logoUrl: t.tokenLogoUrl,
    status: t.statusInfo,
    price: Number(t.tokenPrice) || null,
    source: "api",
  };
}

function fromPublic(l: PublicRwaListing, platform: PlatformId): StockToken {
  return {
    platform,
    symbol: l.symbol,
    address: l.contractAddress.toLowerCase(),
    decimals: 18,
    sharesPerToken: Number(l.multiplier),
    logoUrl: null,
    status: null,
    price: null,
    source: "public",
  };
}

export function mergeCatalog(apiTokens: RwaToken[], publicListings: Partial<Record<PlatformId, PublicRwaListing[]>>): Stock[] {
  const stocks = new Map<string, Stock>();
  const seen = new Set<string>();

  const add = (ticker: string, name: string | undefined, token: StockToken) => {
    if (seen.has(token.address)) return;
    seen.add(token.address);
    const key = ticker.toUpperCase();
    const stock = stocks.get(key) ?? { ticker: key, name: name ?? key, logoUrl: null, tokens: [] };
    if (name && stock.name === key) stock.name = name;
    stock.tokens.push(token);
    stocks.set(key, stock);
  };

  for (const t of apiTokens) {
    if (t.binanceChainId === BSC) add(t.underlyingTicker, t.underlyingName, fromApi(t));
  }
  for (const platform of PLATFORM_ORDER) {
    for (const l of publicListings[platform] ?? []) {
      if (l.chainId === BSC) add(l.ticker, undefined, fromPublic(l, platform));
    }
  }

  for (const stock of stocks.values()) {
    stock.tokens.sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform));
    stock.logoUrl = stock.tokens.find((t) => t.logoUrl)?.logoUrl ?? null;
  }
  return [...stocks.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export async function loadCatalog(client: W3Client): Promise<Stock[]> {
  const [api, bstock, ondo] = await Promise.all([rwaTokens(client), publicRwaListings("bstock"), publicRwaListings("ondo")]);
  const stocks = mergeCatalog(api, { bstock, ondo });
  const missing = stocks.flatMap((s) => s.tokens).filter((t) => t.price === null);
  if (missing.length) {
    const prices = new Map(
      (
        await rwaPrices(
          client,
          missing.map((t) => t.address),
        )
      ).map((p) => [p.tokenContractAddress.toLowerCase(), Number(p.tokenPrice)]),
    );
    for (const t of missing) t.price = prices.get(t.address) || null;
  }
  return stocks;
}

const ALIASES: Record<string, string> = {
  "s&p": "SPY",
  "s&p 500": "SPY",
  sp500: "SPY",
  "sp 500": "SPY",
  nasdaq: "QQQ",
  "nasdaq 100": "QQQ",
  google: "GOOGL",
  alphabet: "GOOGL",
  facebook: "META",
  gold: "GLD",
  silver: "SLV",
  "bitcoin etf": "IBIT",
};

export function searchCatalog(stocks: Stock[], query: string, limit = 10): Stock[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const alias = ALIASES[q];
  const score = (s: Stock) => {
    if (s.ticker === alias) return -1;
    const ticker = s.ticker.toLowerCase();
    const name = s.name.toLowerCase();
    if (ticker === q) return 0;
    if (name === q) return 1;
    if (ticker.startsWith(q)) return 2;
    if (name.startsWith(q)) return 3;
    if (name.split(/\W+/).some((w) => w.startsWith(q))) return 4;
    if (s.tokens.some((t) => t.symbol.toLowerCase() === q)) return 5;
    return Infinity;
  };
  return stocks
    .map((s) => [s, score(s)] as const)
    .filter(([, sc]) => sc !== Infinity)
    .sort((a, b) => a[1] - b[1] || a[0].ticker.localeCompare(b[0].ticker))
    .slice(0, limit)
    .map(([s]) => s);
}

export function shortName(name: string) {
  return name.replace(/,?\s+(inc|corp|corporation|co|ltd|plc|holdings)\.?$/i, "").replace(/\.com$/i, "");
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

export function nameInSentence(s: { ticker: string; name: string }) {
  const friendly = FRIENDLY[s.ticker];
  return friendly ? `the ${friendly}` : shortName(s.name);
}
