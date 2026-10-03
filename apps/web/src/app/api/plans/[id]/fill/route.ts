import { addEvent, commitFill, loadPlan, savePlan } from "@firstshare/core";
import { createPublicClient, erc20Abi, http, isHash, parseEventLogs } from "viem";
import { bsc } from "viem/chains";
import { getStock } from "@/lib/data";
import { kv } from "@/lib/kv";

const chain = createPublicClient({ chain: bsc, transport: http("https://bsc-dataseed.bnbchain.org") });

// An approved buy is recorded from the owner's own on-chain transaction: it has to come from the plan's wallet,
// succeed, and deliver one of this stock's tokens to that wallet. That proves ownership without another signature.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { actionId?: string; txHash?: string } | null;
  if (!body?.actionId || !body.txHash || !isHash(body.txHash)) return Response.json({ error: "Send the buy's transaction hash." }, { status: 400 });
  const saved = await loadPlan(kv(), id);
  const entry = Object.entries(saved?.pending ?? {}).find(([, p]) => p.id === body.actionId);
  if (!saved || !entry) return Response.json({ error: "That buy is no longer waiting." }, { status: 404 });
  const [rule, pending] = entry;

  const receipt = await chain.waitForTransactionReceipt({ hash: body.txHash, timeout: 60_000 }).catch(() => null);
  if (!receipt || receipt.status !== "success") return Response.json({ error: "That transaction didn't go through." }, { status: 422 });
  if (receipt.from.toLowerCase() !== saved.owner) return Response.json({ error: "That transaction came from a different wallet." }, { status: 403 });
  const stock = await getStock(pending.ticker);
  const tokens = new Map((stock?.tokens ?? []).map((t) => [t.address.toLowerCase(), t]));
  const received = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs }).filter(
    (l) => tokens.has(l.address.toLowerCase()) && l.args.to.toLowerCase() === saved.owner,
  );
  const shares = received.reduce((sum, l) => {
    const t = tokens.get(l.address.toLowerCase())!;
    return sum + (Number(l.args.value) / 10 ** t.decimals) * t.sharesPerToken;
  }, 0);
  if (!(shares > 0)) return Response.json({ error: `That transaction didn't buy ${pending.ticker}.` }, { status: 422 });

  delete saved.pending[Number(rule)];
  commitFill(saved.plan, saved.state, { rule: pending.rule, ticker: pending.ticker, side: "buy", usd: pending.usd }, { shares, usd: pending.usd }, pending.day);
  await savePlan(kv(), saved);
  await addEvent(kv(), id, {
    t: Date.now(),
    kind: "bought",
    rule: pending.rule,
    ticker: pending.ticker,
    usd: pending.usd,
    shares,
    price: pending.usd / shares,
    tx: body.txHash,
    text: `You approved and bought ${pending.ticker} from your wallet.`,
  });
  return Response.json({ plan: saved });
}
