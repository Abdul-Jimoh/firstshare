import type { W3Client } from "./binance/client.ts";
import { candles } from "./binance/api.ts";
import type { Stock } from "./catalog.ts";
import { WEEKDAYS, planTickers, type Plan, type Rule } from "./plan.ts";

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

interface Holding {
  shares: number;
  cost: number;
}

const monthKey = (t: number) => new Date(t).toISOString().slice(0, 7);

// Level-triggered rules (dip, below, take profit) fire once on crossing and re-arm only after the price
// moves back past the threshold with some margin, so a stock sitting below a line doesn't buy every day.
const REARM = { dipFraction: 0.5, belowMargin: 1.02, profitMargin: 0.98 };

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
  const holdings = new Map<string, Holding>(tickers.map((t) => [t, { shares: 0, cost: 0 }]));
  const armed = plan.rules.map(() => true);
  const spentByMonth = new Map<string, number>();
  const trades: Trade[] = [];
  const points: BacktestPoint[] = [];
  let putIn = 0;
  let takenOut = 0;
  let skippedForCap = 0;

  for (let day = start; day <= end; day += DAY_MS) {
    for (const t of tickers) {
      const pts = byTicker.get(t)!;
      let i = cursor.get(t)!;
      while (i < pts.length && firstDay(pts[i]!.t) <= day) {
        lastClose.set(t, pts[i]!.close);
        i++;
      }
      cursor.set(t, i);
      const price = lastClose.get(t);
      if (price !== undefined) recent.get(t)!.push(price);
    }
    const date = new Date(day);
    const weekday = WEEKDAYS[date.getUTCDay()]!;

    const buy = (rule: Extract<Rule, { amountUsd: number }>, index: number, price: number) => {
      const month = monthKey(day);
      const spent = spentByMonth.get(month) ?? 0;
      if (plan.monthlyCapUsd !== null && spent + rule.amountUsd > plan.monthlyCapUsd) {
        skippedForCap++;
        return;
      }
      const shares = (rule.amountUsd * (1 - costPct)) / price;
      const h = holdings.get(rule.ticker)!;
      h.shares += shares;
      h.cost += rule.amountUsd;
      putIn += rule.amountUsd;
      spentByMonth.set(month, spent + rule.amountUsd);
      trades.push({ t: day, ticker: rule.ticker, side: "buy", usd: rule.amountUsd, shares, price, rule: index });
    };

    plan.rules.forEach((rule, index) => {
      const price = lastClose.get(rule.ticker);
      if (price === undefined) return;
      switch (rule.kind) {
        case "buy_schedule": {
          const s = rule.schedule;
          const due = s.every === "day" || (s.every === "week" && s.on === weekday) || (s.every === "month" && s.on === date.getUTCDate());
          if (due) buy(rule, index, price);
          break;
        }
        case "buy_dip": {
          const lookback = recent.get(rule.ticker)!.slice(-rule.lookbackDays);
          const drop = 1 - price / Math.max(...lookback);
          if (armed[index] && drop * 100 >= rule.dropPct) {
            buy(rule, index, price);
            armed[index] = false;
          } else if (!armed[index] && drop * 100 < rule.dropPct * REARM.dipFraction) armed[index] = true;
          break;
        }
        case "buy_below":
          if (armed[index] && price < rule.priceUsd) {
            buy(rule, index, price);
            armed[index] = false;
          } else if (!armed[index] && price > rule.priceUsd * REARM.belowMargin) armed[index] = true;
          break;
        case "take_profit": {
          const h = holdings.get(rule.ticker)!;
          if (h.shares <= 0) break;
          const target = (h.cost / h.shares) * (1 + rule.gainPct / 100);
          if (armed[index] && price >= target) {
            const shares = h.shares * (rule.sellPct / 100);
            const usd = shares * price * (1 - costPct);
            h.cost *= 1 - rule.sellPct / 100;
            h.shares -= shares;
            takenOut += usd;
            trades.push({ t: day, ticker: rule.ticker, side: "sell", usd, shares, price, rule: index });
            armed[index] = false;
          } else if (!armed[index] && price < target * REARM.profitMargin) armed[index] = true;
          break;
        }
      }
    });

    for (const t of tickers) {
      const w = recent.get(t)!;
      if (w.length > 120) w.splice(0, w.length - 120);
    }
    const value = tickers.reduce((sum, t) => sum + holdings.get(t)!.shares * (lastClose.get(t) ?? 0), 0);
    points.push({ t: day, putIn, takenOut, value });
  }

  const value = points.at(-1)?.value ?? 0;
  const profit = value + takenOut - putIn;
  return { start, end, trades, points, putIn, takenOut, value, profit, returnPct: putIn > 0 ? profit / putIn : null, skippedForCap };
}
