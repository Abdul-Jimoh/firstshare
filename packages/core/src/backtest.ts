import type { W3Client } from "./binance/client.ts";
import { candles } from "./binance/api.ts";
import type { Stock } from "./catalog.ts";
import { capAllows, commitFill, commitSkip, evaluateRule, holding, newPlanState, type Market } from "./engine.ts";
import { planTickers, type Plan } from "./plan.ts";

export interface PricePoint {
  t: number;
  close: number;
}

export interface PriceHistory {
  ticker: string;
  symbol: string;
  points: PricePoint[];
}

const DAY_MS = 86_400_000;

// Issuers launched at different times; the longest on-chain daily series per share stands in for the stock.
export async function priceHistory(client: W3Client, stock: Stock): Promise<PriceHistory | null> {
  const series = await Promise.all(
    stock.tokens.map(async (token) => {
      const rows = await candles(client, token.address, "1d").catch(() => []);
      return { symbol: token.symbol, points: rows.filter((c) => c.close > 0).map((c) => ({ t: c.t, close: c.close / token.sharesPerToken })) };
    }),
  );
  const best = series.sort((a, b) => b.points.length - a.points.length)[0];
  return best && best.points.length > 1 ? { ticker: stock.ticker, symbol: best.symbol, points: best.points } : null;
}

export interface Trade {
  t: number;
  ticker: string;
  side: "buy" | "sell";
  usd: number;
  shares: number;
  price: number;
  rule: number;
}

export interface BacktestPoint {
  t: number;
  putIn: number;
  takenOut: number;
  value: number;
}

export interface BacktestResult {
  start: number;
  end: number;
  trades: Trade[];
  points: BacktestPoint[];
  putIn: number;
  takenOut: number;
  value: number;
  profit: number;
  returnPct: number | null;
  skippedForCap: number;
}

export function runBacktest(plan: Plan, histories: PriceHistory[], opts: { costPct?: number; from?: number } = {}): BacktestResult {
  const costPct = opts.costPct ?? 0.001;
  const byTicker = new Map(histories.map((h) => [h.ticker, h.points]));
  const tickers = planTickers(plan);
  const missing = tickers.filter((t) => !byTicker.get(t)?.length);
  if (missing.length) throw new Error(`No price history for ${missing.join(", ")}`);

  const firstDay = (t: number) => Math.floor(t / DAY_MS) * DAY_MS;
  const start = Math.max(opts.from ?? 0, ...tickers.map((t) => firstDay(byTicker.get(t)![0]!.t)));
  const end = Math.max(...tickers.map((t) => firstDay(byTicker.get(t)!.at(-1)!.t)));

  const cursor = new Map(tickers.map((t) => [t, 0]));
  const lastClose = new Map<string, number>();
  const recent = new Map<string, number[]>(tickers.map((t) => [t, []]));
  const state = newPlanState(plan);
  const trades: Trade[] = [];
  const points: BacktestPoint[] = [];
  let putIn = 0;
  let takenOut = 0;
  let skippedForCap = 0;

  for (let t = start; t <= end; t += DAY_MS) {
    for (const ticker of tickers) {
      const pts = byTicker.get(ticker)!;
      let i = cursor.get(ticker)!;
      while (i < pts.length && firstDay(pts[i]!.t) <= t) {
        lastClose.set(ticker, pts[i]!.close);
        i++;
      }
      cursor.set(ticker, i);
      const price = lastClose.get(ticker);
      if (price !== undefined) recent.get(ticker)!.push(price);
    }
    const day = new Date(t).toISOString().slice(0, 10);
    const market: Market = {
      day,
      price: (ticker) => lastClose.get(ticker),
      highOver: (ticker, days) => {
        const w = recent.get(ticker)!.slice(-days);
        return w.length ? Math.max(...w) : undefined;
      },
    };

    plan.rules.forEach((_, index) => {
      const intent = evaluateRule(plan, index, state, market);
      if (!intent) return;
      const price = lastClose.get(intent.ticker)!;
      if (intent.side === "buy") {
        if (!capAllows(plan, state, intent.usd, day)) {
          skippedForCap++;
          commitSkip(plan, state, intent, day);
          return;
        }
        const shares = (intent.usd * (1 - costPct)) / price;
        commitFill(plan, state, intent, { shares, usd: intent.usd }, day);
        putIn += intent.usd;
        trades.push({ t, ticker: intent.ticker, side: "buy", usd: intent.usd, shares, price, rule: index });
      } else {
        const shares = holding(state, intent.ticker).shares * intent.fraction;
        const usd = shares * price * (1 - costPct);
        commitFill(plan, state, intent, { shares, usd }, day);
        takenOut += usd;
        trades.push({ t, ticker: intent.ticker, side: "sell", usd, shares, price, rule: index });
      }
    });

    for (const ticker of tickers) {
      const w = recent.get(ticker)!;
      if (w.length > 120) w.splice(0, w.length - 120);
    }
    const value = tickers.reduce((sum, ticker) => sum + holding(state, ticker).shares * (lastClose.get(ticker) ?? 0), 0);
    points.push({ t, putIn, takenOut, value });
  }

  const value = points.at(-1)?.value ?? 0;
  const profit = value + takenOut - putIn;
  return { start, end, trades, points, putIn, takenOut, value, profit, returnPct: putIn > 0 ? profit / putIn : null, skippedForCap };
}
