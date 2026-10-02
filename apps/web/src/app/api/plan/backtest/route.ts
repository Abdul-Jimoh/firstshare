import { PlanError, validatePlan, type Plan } from "@firstshare/core";
import { getCatalog } from "@/lib/data";
import { backtestPlan } from "@/lib/plan";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { plan?: Plan } | null;
  if (!body?.plan) return Response.json({ error: "Send a plan to test." }, { status: 400 });
  try {
    const known = new Set((await getCatalog()).map((s) => s.ticker));
    return Response.json(await backtestPlan(validatePlan(body.plan, known)));
  } catch (e) {
    if (e instanceof PlanError) return Response.json({ error: e.problems.join(" "), problems: e.problems }, { status: 422 });
    console.error("backtest failed", e);
    return Response.json({ error: "We couldn't load enough price history to test this plan. Try again in a moment." }, { status: 503 });
  }
}
