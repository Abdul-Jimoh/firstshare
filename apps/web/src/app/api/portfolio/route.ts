import { isAddress } from "viem";
import { balances, clientFromEnv, heldTokens, USDT_BSC } from "@firstshare/core";
import { getCatalog } from "@/lib/data";
import { perShare } from "@/lib/stock";

const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet") ?? "";
  if (!isAddress(wallet)) return Response.json({ error: "Invalid wallet address." }, { status: 400 });
  try {
    const client = clientFromEnv();
    const [catalog, held, native] = await Promise.all([getCatalog(), heldTokens(client, wallet), balances(client, wallet, [""])]);
    const byAddress = new Map(catalog.flatMap((s) => s.tokens.map((t) => [t.address, { stock: s, token: t }] as const)));
    const holdings = held
      .filter((h) => h.amount > 0 && byAddress.has(h.address))
      .map((h) => {
        const { stock, token } = byAddress.get(h.address)!;
        const price = perShare(token) ?? h.priceUsd / token.sharesPerToken;
        const shares = h.amount * token.sharesPerToken;
        return { ticker: stock.ticker, name: stock.name, logoUrl: stock.logoUrl, symbol: token.symbol, shares, valueUsd: shares * price };
      })
      .sort((a, b) => b.valueUsd - a.valueUsd);
    const usdt = held.find((h) => h.address === USDT_BSC.toLowerCase())?.amount ?? 0;
    const bnb = native.get(NATIVE);
    return Response.json({ usdt, bnb: bnb?.amount ?? 0, bnbUsd: (bnb?.amount ?? 0) * (bnb?.priceUsd ?? 0), holdings });
  } catch {
    return Response.json({ error: "We couldn't load this wallet just now." }, { status: 503 });
  }
}
