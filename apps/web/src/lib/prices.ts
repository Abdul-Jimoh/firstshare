import { Redis } from "@upstash/redis";
import type { FairPrice } from "@firstshare/core";

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const key = (ticker: string) => `nyse:last:${ticker.toUpperCase()}`;

// Writes are skipped when the stored price is this fresh, to stay far inside the free plan's command budget.
const MIN_WRITE_GAP_MS = 60_000;
const lastWrite = new Map<string, number>();

export async function recordNyPrice(ticker: string, fair: FairPrice): Promise<void> {
  if (!redis || fair.source !== "live") return;
  const now = Date.now();
  if (now - (lastWrite.get(ticker) ?? 0) < MIN_WRITE_GAP_MS) return;
  lastWrite.set(ticker, now);
  await redis.set(key(ticker), { perShare: fair.perShare, at: fair.at });
}

export async function lastNyPrice(ticker: string): Promise<FairPrice | null> {
  if (!redis) return null;
  const stored = await redis.get<{ perShare: number; at: number }>(key(ticker));
  return stored && stored.perShare > 0 ? { perShare: stored.perShare, at: stored.at, source: "recorded" } : null;
}
