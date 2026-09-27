import { connection } from "next/server";
import { clientFromEnv, loadCatalog, rwaUnderlyingProfile, searchCatalog, type RwaUnderlyingProfile, type Stock } from "@firstshare/core";

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

const PROFILE_TTL_MS = 60 * 60_000;
const profiles = new Map<string, { at: number; value: Promise<RwaUnderlyingProfile | null> }>();

export async function getProfiles(stock: Stock): Promise<Map<string, RwaUnderlyingProfile>> {
  await connection();
  const client = clientFromEnv();
  const entries = await Promise.all(
    stock.tokens.map(async (t) => {
      let hit = profiles.get(t.address);
      if (!hit || Date.now() - hit.at > PROFILE_TTL_MS) {
        hit = { at: Date.now(), value: rwaUnderlyingProfile(client, t.address).catch(() => null) };
        profiles.set(t.address, hit);
      }
      return [t.address, await hit.value] as const;
    }),
  );
  return new Map(entries.filter((e): e is [string, RwaUnderlyingProfile] => e[1] !== null));
}
