import { lastNyPrice as readLast, recordNyPrice as write, type FairPrice } from "@firstshare/core";
import { redis } from "./kv";

export async function recordNyPrice(ticker: string, fair: FairPrice): Promise<void> {
  if (redis) await write(redis, ticker, fair);
}

export async function lastNyPrice(ticker: string): Promise<FairPrice | null> {
  return redis ? readLast(redis, ticker) : null;
}
