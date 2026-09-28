import { clientFromEnv, fairPriceLive } from "@firstshare/core";
import { getCatalog } from "@/lib/data";
import { recordNyPrice } from "@/lib/prices";
import { COLLECTIONS } from "@/lib/stock";

export const maxDuration = 60;

const PER_SECOND = 4;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const featured = new Set<string>(COLLECTIONS.flatMap((c) => c.tickers));
  const stocks = (await getCatalog()).filter(
    (s) => s.tokens.some((t) => t.platform === "ondo") && (featured.has(s.ticker) || s.tokens.some((t) => t.platform === "bstock")),
  );

  const client = clientFromEnv();
  const recorded: string[] = [];
  const missing: string[] = [];
  for (let i = 0; i < stocks.length; i += PER_SECOND) {
    const batch = stocks.slice(i, i + PER_SECOND);
    const started = Date.now();
    await Promise.all(
      batch.map(async (s) => {
        const fair = await fairPriceLive(client, s).catch(() => null);
        if (!fair) return missing.push(s.ticker);
        await recordNyPrice(s.ticker, fair);
        recorded.push(s.ticker);
      }),
    );
    await new Promise((r) => setTimeout(r, Math.max(0, 1000 - (Date.now() - started))));
  }

  return Response.json({ at: new Date().toISOString(), recorded: recorded.length, missing });
}
