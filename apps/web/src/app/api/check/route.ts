import { checkStock } from "@/lib/check";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const ticker = (params.get("ticker") ?? "").toUpperCase().slice(0, 12);
  const usd = Math.round(Number(params.get("usd")) * 100) / 100;
  if (!ticker || !(usd >= 1 && usd <= 10_000)) {
    return Response.json({ error: "Pick an amount between $1 and $10,000." }, { status: 400 });
  }
  try {
    const check = await checkStock(ticker, usd);
    return check ? Response.json(check) : Response.json({ error: "We don't have that stock." }, { status: 404 });
  } catch {
    return Response.json({ error: "We couldn't check the price just now. Try again in a moment." }, { status: 503 });
  }
}
