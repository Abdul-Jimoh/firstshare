// The always-on runner: evaluates every active plan on a fixed interval.
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { Redis } from "@upstash/redis";
import { clientFromEnv } from "@firstshare/core";
import { tick } from "./tick.ts";

// On the server the Binance and Upstash credentials come from Secrets Manager; locally from the root .env.
if (process.env.RUNNER_SECRET_ID && !process.env.BINANCE_W3_API_KEY) {
  const out = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: process.env.RUNNER_SECRET_ID }));
  for (const [k, v] of Object.entries(JSON.parse(out.SecretString ?? "{}") as Record<string, string>)) process.env[k] ??= v;
}

const INTERVAL_MS = Number(process.env.RUNNER_INTERVAL_MS ?? 5 * 60_000);

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) throw new Error("KV_REST_API_URL and KV_REST_API_TOKEN are required");
const kv = new Redis({ url, token });
const client = clientFromEnv();
const log = (line: string) => console.log(`${new Date().toISOString()} ${line}`);

let stopping = false;
process.once("SIGTERM", () => (stopping = true));
process.once("SIGINT", () => (stopping = true));

while (!stopping) {
  const started = Date.now();
  try {
    await tick({ kv, client, log });
  } catch (e) {
    log(`tick failed: ${(e as Error).stack ?? e}`);
  }
  log(`tick done in ${Date.now() - started}ms`);
  if (process.argv.includes("--once")) break;
  await new Promise((r) => setTimeout(r, Math.max(1_000, INTERVAL_MS - (Date.now() - started))));
}
