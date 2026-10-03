import { addEvent, commitSkip, deletePlan, loadPlan, savePlan } from "@firstshare/core";
import { kv } from "@/lib/kv";
import { verifyAction, type Signed } from "@/lib/plan-server";

const TEXT = { pause: "Plan paused.", resume: "Plan resumed.", delete: "Plan deleted.", dismiss: "Buy skipped." } as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as ({ action?: keyof typeof TEXT; actionId?: string } & Partial<Signed>) | null;
  if (!body?.action || !(body.action in TEXT) || !body.owner || !body.issuedAt || !body.signature) {
    return Response.json({ error: "Sign the change with your wallet first." }, { status: 400 });
  }
  const saved = await loadPlan(kv(), id);
  if (!saved || saved.owner !== body.owner.toLowerCase()) return Response.json({ error: "Plan not found." }, { status: 404 });
  const signed = { owner: body.owner, issuedAt: body.issuedAt, signature: body.signature };
  if (body.action === "dismiss") {
    const entry = Object.entries(saved.pending ?? {}).find(([, p]) => p.id === body.actionId);
    if (!entry || !body.actionId) return Response.json({ error: "That buy is no longer waiting." }, { status: 404 });
    const problem = await verifyAction({ kind: "dismiss", id, actionId: body.actionId }, signed);
    if (problem) return Response.json({ error: problem }, { status: 401 });
    const [rule, pending] = entry;
    delete saved.pending[Number(rule)];
    commitSkip(saved.plan, saved.state, { rule: pending.rule, ticker: pending.ticker, side: "buy", usd: pending.usd }, pending.day);
    await savePlan(kv(), saved);
    await addEvent(kv(), id, { t: Date.now(), kind: "skipped", rule: pending.rule, ticker: pending.ticker, text: "You skipped this buy." });
    return Response.json({ plan: saved });
  }
  const problem = await verifyAction({ kind: body.action, id }, signed);
  if (problem) return Response.json({ error: problem }, { status: 401 });
  if (body.action === "delete") await deletePlan(kv(), saved);
  else {
    saved.status = body.action === "resume" ? "active" : "paused";
    await savePlan(kv(), saved);
  }
  await addEvent(kv(), id, { t: Date.now(), kind: "note", rule: -1, ticker: "", text: TEXT[body.action] });
  return Response.json({ plan: saved });
}
