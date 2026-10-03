import { addEvent, deletePlan, loadPlan, savePlan } from "@firstshare/core";
import { kv } from "@/lib/kv";
import { verifyAction, type Signed } from "@/lib/plan-server";

const TEXT = { pause: "Plan paused.", resume: "Plan resumed.", delete: "Plan deleted." } as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as ({ action?: "pause" | "resume" | "delete" } & Partial<Signed>) | null;
  if (!body?.action || !(body.action in TEXT) || !body.owner || !body.issuedAt || !body.signature) {
    return Response.json({ error: "Sign the change with your wallet first." }, { status: 400 });
  }
  const saved = await loadPlan(kv(), id);
  if (!saved || saved.owner !== body.owner.toLowerCase()) return Response.json({ error: "Plan not found." }, { status: 404 });
  const problem = await verifyAction({ kind: body.action, id }, { owner: body.owner, issuedAt: body.issuedAt, signature: body.signature });
  if (problem) return Response.json({ error: problem }, { status: 401 });
  if (body.action === "delete") await deletePlan(kv(), saved);
  else {
    saved.status = body.action === "resume" ? "active" : "paused";
    await savePlan(kv(), saved);
  }
  await addEvent(kv(), id, { t: Date.now(), kind: "note", rule: -1, ticker: "", text: TEXT[body.action] });
  return Response.json({ plan: saved });
}
