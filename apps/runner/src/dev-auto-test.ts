// One real "run it for me" buy against an in-memory store, so the live plan store is untouched.
import { clientFromEnv, createSavedPlan, type KV } from "@firstshare/core";
import { agenticWalletAddress } from "./agentic-wallet.ts";
import { tickPlans } from "./tick.ts";

const mem = new Map<string, unknown>();
const kv: KV = {
  get: async (k) => (mem.get(k) ?? null) as never,
  set: async (k, v) => mem.set(k, structuredClone(v)),
  sadd: async () => 1,
  srem: async () => 1,
  smembers: async () => [],
  lpush: async (k, v) => mem.set(k, [v, ...((mem.get(k) as unknown[]) ?? [])]),
  ltrim: async () => "OK",
  lrange: async (k) => ((mem.get(k) as never[]) ?? []),
};
const aw = await agenticWalletAddress();
const saved = createSavedPlan("auto-test", "0xb81752163debd7c76948cda2a5c4a663a94dc5a1", {
  version: 1, name: "One dollar of Nvidia", monthlyCapUsd: 5,
  rules: [{ kind: "buy_schedule", ticker: "NVDA", amountUsd: 1, schedule: { every: "day" } }],
}, ["Buy $1 of Nvidia every day."], "auto", aw);
const t0 = Date.now();
await tickPlans([saved], { kv, client: clientFromEnv(), log: (l) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${l}`) });
console.log("state", JSON.stringify(saved.state), "heldToken", JSON.stringify(saved.heldToken));
for (const e of ((mem.get("plan:auto-test:events") as Record<string, unknown>[]) ?? []).reverse()) console.log("event", JSON.stringify(e));
