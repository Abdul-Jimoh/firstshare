import { Redis } from "@upstash/redis";
import type { KV } from "@firstshare/core";

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;

export function kv(): KV {
  if (!redis) throw new Error("Redis is not configured");
  return redis;
}
