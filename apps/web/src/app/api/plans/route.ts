import { randomUUID } from "node:crypto";
import { PlanError, addEvent, createSavedPlan, ownerPlans, planEvents, savePlan, validatePlan, type Plan, type PlanMode } from "@firstshare/core";
import { isAddress } from "viem";
import { getCatalog } from "@/lib/data";
import { kv } from "@/lib/kv";
import { verifyAction, type Signed } from "@/lib/plan-server";

const MAX_PLANS_PER_WALLET = 5;
// "Ask me first" and "run it for me" arrive with the runner's approval and Agentic Wallet flows.
const MODES: PlanMode[] = ["paper"];

export async function GET(request: Request) {
  const owner = new URL(request.url).searchParams.get("owner") ?? "";
  if (!isAddress(owner)) return Response.json({ error: "Connect a wallet to see your plans." }, { status: 400 });
  const plans = await ownerPlans(kv(), owner);
  const withEvents = await Promise.all(plans.map(async (p) => ({ ...p, events: await planEvents(kv(), p.id, 30) })));
  return Response.json({ plans: withEvents });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ({ plan?: Plan; mode?: PlanMode } & Partial<Signed>) | null;
  if (!body?.plan || !body.owner || !body.issuedAt || !body.signature) return Response.json({ error: "Sign the plan with your wallet first." }, { status: 400 });
  const mode = body.mode ?? "paper";
  if (!MODES.includes(mode)) return Response.json({ error: "Only practice mode is available for now." }, { status: 400 });
  try {
    validatePlan(body.plan, new Set((await getCatalog()).map((s) => s.ticker)));
  } catch (e) {
    if (e instanceof PlanError) return Response.json({ error: e.problems.join(" ") }, { status: 422 });
    throw e;
  }
  const signed = { owner: body.owner, issuedAt: body.issuedAt, signature: body.signature };
  const problem = await verifyAction({ kind: "start", plan: body.plan, mode }, signed);
  if (problem) return Response.json({ error: problem }, { status: 401 });
  const existing = await ownerPlans(kv(), body.owner);
  if (existing.filter((p) => p.status === "active").length >= MAX_PLANS_PER_WALLET) {
    return Response.json({ error: `You can run up to ${MAX_PLANS_PER_WALLET} plans at once. Pause one first.` }, { status: 409 });
  }
  const saved = createSavedPlan(randomUUID(), body.owner, body.plan, mode);
  await savePlan(kv(), saved);
  await addEvent(kv(), saved.id, { t: Date.now(), kind: "note", rule: -1, ticker: "", text: "Plan started in practice mode. No real money moves." });
  return Response.json({ plan: saved }, { status: 201 });
}
