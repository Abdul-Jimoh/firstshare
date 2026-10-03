import { redis } from "./kv";

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
