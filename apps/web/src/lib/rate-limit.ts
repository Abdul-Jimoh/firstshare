import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

// Fixed one-hour windows; without Redis (local dev) nothing is limited.
export async function allow(bucket: string, id: string, perHour: number): Promise<boolean> {
  if (!redis) return true;
  const key = `rl:${bucket}:${id}:${Math.floor(Date.now() / 3_600_000)}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 3_600);
  return n <= perHour;
}
