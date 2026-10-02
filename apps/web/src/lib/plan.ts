import { clientFromEnv, describeRule, priceHistory, runBacktest, type BacktestResult, type Plan, type PriceHistory } from "@firstshare/core";
import { getStock } from "./data";

const HISTORY_TTL_MS = 60 * 60_000;
const histories = new Map<string, { at: number; value: Promise<PriceHistory | null> }>();

async function historyFor(ticker: string): Promise<PriceHistory | null> {
  const hit = histories.get(ticker);
  if (hit && Date.now() - hit.at < HISTORY_TTL_MS) return hit.value;
  const value = getStock(ticker).then((s) => (s ? priceHistory(clientFromEnv(), s) : null));
  histories.set(ticker, { at: Date.now(), value });
  value.catch(() => histories.delete(ticker));
  return value;
}

export interface BacktestView {
  rules: string[];
  start: number;
  end: number;
  putIn: number;
  takenOut: number;
  value: number;
  profit: number;
  returnPct: number | null;
  skippedForCap: number;
  trades: (BacktestResult["trades"][number] & { name: string })[];
  points: BacktestResult["points"];
  sources: { ticker: string; symbol: string }[];
}

export async function backtestPlan(plan: Plan): Promise<BacktestView> {
  const tickers = [...new Set(plan.rules.map((r) => r.ticker))];
  const [found, stocks] = await Promise.all([Promise.all(tickers.map(historyFor)), Promise.all(tickers.map(getStock))]);
  const name = new Map(stocks.map((s, i) => [tickers[i]!, s?.name ?? tickers[i]!]));
  const missing = tickers.filter((_, i) => !found[i]);
  if (missing.length) throw new Error(`No price history for ${missing.join(", ")}.`);
  const result = runBacktest(plan, found as PriceHistory[]);
  // A point per week keeps the chart smooth and the payload small; the last day is always kept.
  const points = result.points.filter((_, i, all) => i % 7 === 0 || i === all.length - 1);
  return {
    rules: plan.rules.map((r) => describeRule(r, (t) => name.get(t) ?? t)),
    start: result.start,
    end: result.end,
    putIn: result.putIn,
    takenOut: result.takenOut,
    value: result.value,
    profit: result.profit,
    returnPct: result.returnPct,
    skippedForCap: result.skippedForCap,
    trades: result.trades.map((t) => ({ ...t, name: name.get(t.ticker) ?? t.ticker })),
    points,
    sources: (found as PriceHistory[]).map((h) => ({ ticker: h.ticker, symbol: h.symbol })),
  };
}
