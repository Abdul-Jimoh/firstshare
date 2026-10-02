import type { PlanState } from "./engine.ts";
import { newPlanState } from "./engine.ts";
import type { Plan } from "./plan.ts";

// The subset of @upstash/redis both the web app and the runner use; values are stored as JSON.
export interface KV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
  sadd(key: string, member: string): Promise<unknown>;
  srem(key: string, member: string): Promise<unknown>;
  smembers(key: string): Promise<string[]>;
  lpush(key: string, value: unknown): Promise<unknown>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  lrange<T>(key: string, start: number, stop: number): Promise<T[]>;
}

export type PlanMode = "paper" | "ask" | "auto";

export interface SavedPlan {
  id: string;
  owner: string;
  plan: Plan;
  mode: PlanMode;
  status: "active" | "paused";
  createdAt: number;
  updatedAt: number;
  state: PlanState;
  // Rules currently held back by the price check, so a waiting buy is logged once rather than every tick.
  waiting: Record<number, string>;
}

export type PlanEventKind = "bought" | "sold" | "skipped" | "waiting" | "pending" | "error" | "note";

export interface PlanEvent {
  t: number;
  kind: PlanEventKind;
  rule: number;
  ticker: string;
  text: string;
  usd?: number;
  shares?: number;
  price?: number;
  fairPrice?: number | null;
  verdict?: string;
  tx?: string;
  checkJob?: number;
}

const EVENTS_KEPT = 300;

const keys = {
  plan: (id: string) => `plan:${id}`,
  events: (id: string) => `plan:${id}:events`,
  owner: (owner: string) => `owner:${owner.toLowerCase()}:plans`,
  active: "plans:active",
};

export function createSavedPlan(id: string, owner: string, plan: Plan, mode: PlanMode, now = Date.now()): SavedPlan {
  return { id, owner: owner.toLowerCase(), plan, mode, status: "active", createdAt: now, updatedAt: now, state: newPlanState(plan), waiting: {} };
}

export async function savePlan(kv: KV, saved: SavedPlan): Promise<void> {
  saved.updatedAt = Date.now();
  await kv.set(keys.plan(saved.id), saved);
  await kv.sadd(keys.owner(saved.owner), saved.id);
  if (saved.status === "active") await kv.sadd(keys.active, saved.id);
  else await kv.srem(keys.active, saved.id);
}

export async function deletePlan(kv: KV, saved: SavedPlan): Promise<void> {
  saved.status = "paused";
  await savePlan(kv, saved);
  await kv.srem(keys.owner(saved.owner), saved.id);
}

export function loadPlan(kv: KV, id: string): Promise<SavedPlan | null> {
  return kv.get<SavedPlan>(keys.plan(id));
}

async function loadMany(kv: KV, ids: string[]): Promise<SavedPlan[]> {
  const plans = await Promise.all(ids.map((id) => loadPlan(kv, id)));
  return plans.filter((p): p is SavedPlan => p !== null).sort((a, b) => b.createdAt - a.createdAt);
}

export async function activePlans(kv: KV): Promise<SavedPlan[]> {
  return loadMany(kv, await kv.smembers(keys.active));
}

export async function ownerPlans(kv: KV, owner: string): Promise<SavedPlan[]> {
  return loadMany(kv, await kv.smembers(keys.owner(owner)));
}

export async function addEvent(kv: KV, id: string, event: PlanEvent): Promise<void> {
  await kv.lpush(keys.events(id), event);
  await kv.ltrim(keys.events(id), 0, EVENTS_KEPT - 1);
}

export function planEvents(kv: KV, id: string, limit = 50): Promise<PlanEvent[]> {
  return kv.lrange<PlanEvent>(keys.events(id), 0, limit - 1);
}
