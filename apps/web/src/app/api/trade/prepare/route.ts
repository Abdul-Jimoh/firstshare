import { prepareBuy } from "@/lib/trade";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { ticker?: string; usd?: number; wallet?: string } | null;
  const usd = Math.round(Number(body?.usd) * 100) / 100;
  if (!body?.ticker || !body.wallet || !(usd >= 1 && usd <= 10_000)) {
    return Response.json({ step: "blocked", reason: "Pick an amount between $1 and $10,000." }, { status: 400 });
  }
  try {
    return Response.json(await prepareBuy(body.ticker.toUpperCase(), usd, body.wallet));
  } catch {
    return Response.json({ step: "blocked", reason: "We couldn't prepare the order just now. Try again in a moment." }, { status: 503 });
  }
}
