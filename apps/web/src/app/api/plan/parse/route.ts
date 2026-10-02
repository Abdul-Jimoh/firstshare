import { getCatalog } from "@/lib/data";
import { PlanParseError, parsePlan } from "@/lib/plan-parse";
import { allow, clientIp } from "@/lib/rate-limit";

const MAX_CHARS = 1_000;
const PER_HOUR = 30;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "Describe your plan in a sentence or two." }, { status: 400 });
  if (text.length > MAX_CHARS) return Response.json({ error: `Keep the plan under ${MAX_CHARS} characters.` }, { status: 400 });
  if (!(await allow("plan-parse", clientIp(request), PER_HOUR))) {
    return Response.json({ error: "That's a lot of plans for one hour. Try again a bit later." }, { status: 429 });
  }
  try {
    return Response.json(await parsePlan(text, await getCatalog()));
  } catch (e) {
    if (e instanceof PlanParseError) return Response.json({ error: e.message }, { status: e.retryable ? 503 : 422 });
    console.error("plan parse failed", e);
    return Response.json({ error: "We couldn't read that plan just now. Try again in a moment." }, { status: 500 });
  }
}
