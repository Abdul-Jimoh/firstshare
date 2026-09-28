import type { W3Client } from "./binance/client.ts";
import { W3Error } from "./binance/client.ts";
import { quote, USDT_BSC } from "./binance/api.ts";
import type { QuoteRoute } from "./binance/types.ts";
import type { Stock, StockToken } from "./catalog.ts";
import { usMarketState, type UsSession } from "./market-hours.ts";

export interface FairPrice {
  perShare: number;
  source: "live" | "recorded";
  at: number;
}

export type Quoted =
  | { ok: true; tokensOut: number; perShare: number; priceImpact: number; mode: QuoteRoute["executionMode"]; vendor: string }
  | { ok: false; reason: string; code: number | null };

export interface Option {
  token: StockToken;
  paused: string | null;
  quote: Quoted;
  premium: number | null;
}

export type Verdict = "good" | "fair" | "pricey" | "avoid" | "unverified" | "paused" | "unavailable";

export interface Check {
  ticker: string;
  name: string;
  amountUsd: number;
  at: number;
  session: UsSession;
  fair: FairPrice | null;
  options: Option[];
  pick: Option | null;
  verdict: Verdict;
  shares: number | null;
  headline: string;
  notes: string[];
}

export const THRESHOLDS = { good: 0.005, fair: 0.015, pricey: 0.04 };

// bStocks trade 24/7 from $1, so another issuer has to be meaningfully cheaper to win.
const BSTOCK_PREFERENCE = 0.001;

const QUOTE_WALLET = "0x000000000000000000000000000000000000dEaD";

const PAUSES: Record<string, string> = {
  cash_dividend: "a dividend payout",
  stock_dividend: "a stock dividend",
  stock_split: "a stock split",
  merger: "a merger",
  acquisition: "an acquisition",
  spinoff: "a spin-off",
  maintenance: "maintenance",
  earnings: "an earnings report",
};

export function pauseReason(token: StockToken): string | null {
  const s = token.status;
  if (!s || (s.reasonCode !== "ASSET_PAUSED" && s.reasonCode !== "ASSET_LIMITED")) return null;
  return PAUSES[s.reasonMsg ?? ""] ?? "a company event";
}

export function fromQuote(route: QuoteRoute | undefined, amountUsd: number, token: StockToken): Quoted {
  if (!route) return { ok: false, reason: "No one is offering this version right now.", code: null };
  const tokensOut = Number(route.toTokenAmount) / 10 ** token.decimals;
  if (!(tokensOut > 0)) return { ok: false, reason: "The quote came back empty.", code: null };
  return {
    ok: true,
    tokensOut,
    perShare: amountUsd / (tokensOut * token.sharesPerToken),
    priceImpact: Number(route.priceImpactPercent) || 0,
    mode: route.executionMode,
    vendor: route.vendorName,
  };
}

export function fromQuoteError(e: unknown): Quoted {
  if (e instanceof W3Error) {
    // The API's own message ("Minimum order amount is 5 USD") is rejected at exactly $5, so don't repeat it.
    if (e.code === 40375) return { ok: false, reason: "This version needs a bigger order, usually $20 or more.", code: e.code };
    if (e.code === 40367 || e.code === 40369) return { ok: false, reason: "Not tradable until New York opens.", code: e.code };
    if (e.code === 40374 || e.code === 40421 || e.code === 40441)
      return { ok: false, reason: "No one is offering this version right now.", code: e.code };
    if (e.isRegionBlocked) return { ok: false, reason: "Market data is unavailable from this region.", code: e.code };
    return { ok: false, reason: "The price couldn't be checked.", code: e.code };
  }
  return { ok: false, reason: "The price couldn't be checked.", code: null };
}

const nyStamp = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" });

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${(Math.abs(n) * 100).toFixed(n !== 0 && Math.abs(n) < 0.001 ? 2 : 1)}%`;

export function assess(input: {
  stock: Pick<Stock, "ticker" | "name">;
  amountUsd: number;
  options: Option[];
  fair: FairPrice | null;
  now: Date;
}): Check {
  const { stock, amountUsd, options, fair, now } = input;
  const market = usMarketState(now);
  const notes: string[] = [];

  for (const o of options) o.premium = fair && o.quote.ok ? o.quote.perShare / fair.perShare - 1 : null;

  const cost = (o: Option) => (o.quote.ok ? o.quote.perShare * (o.token.platform === "bstock" ? 1 - BSTOCK_PREFERENCE : 1) : Infinity);
  const pick = options.filter((o) => !o.paused && o.quote.ok).sort((a, b) => cost(a) - cost(b))[0] ?? null;

  const base = { ticker: stock.ticker, name: stock.name, amountUsd, at: now.getTime(), session: market.session, fair, options };

  if (!pick) {
    const paused = options.find((o) => o.paused);
    if (paused) {
      return {
        ...base,
        pick: null,
        verdict: "paused",
        shares: null,
        headline: `${stock.name} is paused for ${paused.paused}. Try again once it reopens.`,
        notes,
      };
    }
    const reason = options.map((o) => (o.quote.ok ? null : o.quote.reason)).find(Boolean) ?? "No price is available right now.";
    return {
      ...base,
      pick: null,
      verdict: "unavailable",
      shares: null,
      headline: `You can't buy ${usd(amountUsd)} of ${stock.name} right now. ${reason}`,
      notes,
    };
  }

  const q = pick.quote as Extract<Quoted, { ok: true }>;
  const shares = q.tokensOut * pick.token.sharesPerToken;
  const premium = pick.premium;

  if (fair?.source === "recorded") {
    notes.push(
      `New York is closed. We compare with its last price (${nyStamp.format(fair.at)} ET); news since then can explain a difference.`,
    );
  } else if (fair && market.session !== "regular") {
    notes.push("New York is outside regular hours, so its price is from thin extended-hours trading.");
  }
  if (q.priceImpact > 0.01) notes.push(`This order is large for the available supply and moves the price by about ${pct(q.priceImpact)}.`);
  const skipped = options.find((o) => o !== pick && o.quote.ok && pick.quote.ok && o.quote.perShare > q.perShare * 1.002);
  if (skipped && skipped.quote.ok) {
    notes.push(`The other version would cost ${pct(skipped.quote.perShare / q.perShare - 1)} more, so we picked the cheaper one.`);
  }

  let verdict: Verdict;
  let headline: string;
  const paying = `You'd pay ${usd(q.perShare)} a share`;
  if (premium === null) {
    verdict = "unverified";
    headline = `${paying}. We can't compare it with New York right now, so we can't vouch for the price.`;
  } else if (premium <= THRESHOLDS.good) {
    verdict = "good";
    headline = `${paying}, ${premium <= 0 ? `${pct(premium)} below` : `${pct(premium)} above`} New York's ${usd(fair!.perShare)}.`;
  } else if (premium <= THRESHOLDS.fair) {
    verdict = "fair";
    headline = `${paying}, ${pct(premium)} above New York's ${usd(fair!.perShare)}.`;
  } else if (premium <= THRESHOLDS.pricey) {
    verdict = "pricey";
    headline = `${paying}, ${pct(premium)} above New York's ${usd(fair!.perShare)}. Waiting or buying less may get a better price.`;
  } else {
    verdict = "avoid";
    headline = `${paying}, ${pct(premium)} above New York's ${usd(fair!.perShare)}. We'd wait.`;
  }

  return { ...base, pick, verdict, shares, headline, notes };
}

export async function fairPriceLive(client: W3Client, stock: Stock): Promise<FairPrice | null> {
  const ondo = stock.tokens.find((t) => t.platform === "ondo");
  if (!ondo) return null;
  const market = await client.get<{ marketData: { referencePrice: string | null } }>("/api/v1/dex/market/rwa/underlying-market", {
    binanceChainId: "56",
    tokenContractAddress: ondo.address,
  });
  const ref = Number(market.marketData.referencePrice);
  if (!(ref > 0)) return null;
  return { perShare: ref * ondo.sharesPerToken, source: "live", at: Date.now() };
}

export async function runCheck(
  client: W3Client,
  stock: Stock,
  amountUsd: number,
  opts: { recordedFair?: () => Promise<FairPrice | null>; now?: Date } = {},
): Promise<Check> {
  const amount = BigInt(Math.round(amountUsd * 100)) * 10n ** 16n;
  const [fair, ...quotes] = await Promise.all([
    fairPriceLive(client, stock).catch(() => null),
    ...stock.tokens.map((t) =>
      quote(client, { fromTokenAddress: USDT_BSC, toTokenAddress: t.address, amount, userWalletAddress: QUOTE_WALLET })
        .then((routes) => fromQuote(routes.find((r) => r.isBest) ?? routes[0], amountUsd, t))
        .catch(fromQuoteError),
    ),
  ]);
  const options: Option[] = stock.tokens.map((token, i) => ({ token, paused: pauseReason(token), quote: quotes[i]!, premium: null }));
  const recorded = fair ? null : await opts.recordedFair?.().catch(() => null);
  return assess({ stock, amountUsd, options, fair: fair ?? recorded ?? null, now: opts.now ?? new Date() });
}
