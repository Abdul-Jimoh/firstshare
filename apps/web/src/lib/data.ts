import { connection } from "next/server";
import { clientFromEnv, loadCatalog, searchCatalog, type Stock } from "@firstshare/core";

const TTL_MS = 5 * 60_000;
let cached: { at: number; stocks: Promise<Stock[]> } | null = null;

export async function getCatalog(): Promise<Stock[]> {
  await connection();
  if (!cached || Date.now() - cached.at > TTL_MS) {
    const stocks = loadCatalog(clientFromEnv());
    cached = { at: Date.now(), stocks };
    stocks.catch(() => {
      if (cached?.stocks === stocks) cached = null;
    });
  }
  return cached.stocks;
}

export async function getStock(ticker: string): Promise<Stock | undefined> {
  const t = ticker.toUpperCase();
  return (await getCatalog()).find((s) => s.ticker === t);
}

export async function findStocks(query: string, limit = 24): Promise<Stock[]> {
  return searchCatalog(await getCatalog(), query, limit);
}

export async function pickStocks(tickers: readonly string[]): Promise<Stock[]> {
  const byTicker = new Map((await getCatalog()).map((s) => [s.ticker, s]));
  return tickers.map((t) => byTicker.get(t)).filter((s): s is Stock => Boolean(s));
}
