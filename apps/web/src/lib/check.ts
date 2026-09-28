import { clientFromEnv, runCheck, type Check, type Verdict } from "@firstshare/core";
import { getStock } from "./data";
import { ISSUER } from "./stock";

export interface CheckView {
  ticker: string;
  amountUsd: number;
  verdict: Verdict;
  headline: string;
  notes: string[];
  shares: number | null;
  fair: { perShare: number; source: "live" | "recorded" } | null;
  pick: { issuer: string; symbol: string; perShare: number } | null;
  options: { issuer: string; symbol: string; picked: boolean; perShare: number | null; premium: number | null; problem: string | null }[];
  at: number;
}

function toView(c: Check): CheckView {
  return {
    ticker: c.ticker,
    amountUsd: c.amountUsd,
    verdict: c.verdict,
    headline: c.headline,
    notes: c.notes,
    shares: c.shares,
    fair: c.fair && { perShare: c.fair.perShare, source: c.fair.source },
    pick: c.pick?.quote.ok
      ? { issuer: ISSUER[c.pick.token.platform].name, symbol: c.pick.token.symbol, perShare: c.pick.quote.perShare }
      : null,
    options: c.options.map((o) => ({
      issuer: ISSUER[o.token.platform].name,
      symbol: o.token.symbol,
      picked: o === c.pick,
      perShare: o.quote.ok ? o.quote.perShare : null,
      premium: o.premium,
      problem: o.paused ? `Paused for ${o.paused}` : o.quote.ok ? null : o.quote.reason,
    })),
    at: c.at,
  };
}

const TTL_MS = 15_000;
const cache = new Map<string, { at: number; value: Promise<CheckView | null> }>();

export async function checkStock(ticker: string, amountUsd: number): Promise<CheckView | null> {
  const key = `${ticker}:${amountUsd}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = (async () => {
    const stock = await getStock(ticker);
    return stock ? toView(await runCheck(clientFromEnv(), stock, amountUsd)) : null;
  })();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}
