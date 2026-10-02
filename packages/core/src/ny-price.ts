import type { FairPrice } from "./check.ts";
import type { KV } from "./plan-store.ts";

const key = (ticker: string) => `nyse:last:${ticker.toUpperCase()}`;

// Writes are skipped when the stored price is this fresh, to stay far inside the free plan's command budget.
const MIN_WRITE_GAP_MS = 60_000;
const lastWrite = new Map<string, number>();

export async function recordNyPrice(kv: KV, ticker: string, fair: FairPrice): Promise<void> {
  if (fair.source !== "live") return;
  const now = Date.now();
  if (now - (lastWrite.get(ticker) ?? 0) < MIN_WRITE_GAP_MS) return;
  lastWrite.set(ticker, now);
  await kv.set(key(ticker), { perShare: fair.perShare, at: fair.at });
}

export async function lastNyPrice(kv: KV, ticker: string): Promise<FairPrice | null> {
  const stored = await kv.get<{ perShare: number; at: number }>(key(ticker));
  return stored && stored.perShare > 0 ? { perShare: stored.perShare, at: stored.at, source: "recorded" } : null;
}
