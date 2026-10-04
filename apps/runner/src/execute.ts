import { BawError, baw } from "./agentic-wallet.ts";

export interface AgenticFill {
  orderId: string;
  txHash: string | null;
  sent: number;
  received: number;
  raw: Record<string, unknown>;
}

const ORDER_TIMEOUT_MS = 3 * 60_000;

export async function agenticQuote(fromToken: string, toToken: string, qty: number): Promise<number> {
  const q = await baw(["market-order", "quote", "--binanceChainId", "56", "--fromTokenQty", String(qty), "--fromToken", fromToken, "--toToken", toToken, "--slippage", "1"]);
  const tokens = Number(q.toCoinAmount);
  if (!(tokens > 0)) throw new BawError("Agentic Wallet quote came back empty", q);
  return tokens;
}

interface MarketOrder {
  orderId: string;
  fromToken: string;
  toToken: string;
  fromTokenQty: string;
  toTokenActualQty?: string;
  status: string;
  txHash?: string;
  bookTime?: string;
}

// `market-order swap` prints its 20-digit order id after a round trip through a JS number, so the id it returns
// is often not the real one and `list --orderId` finds nothing. The order is found by pair, size and time instead.
async function findOrder(fromToken: string, toToken: string, qty: number, since: number): Promise<MarketOrder | null> {
  const res = await baw(["market-order", "list", "--binanceChainId", "56", "--fromToken", fromToken, "--toToken", toToken, "--startTime", String(since), "--pageSize", "20"]);
  const orders = (res.list as MarketOrder[] | undefined) ?? [];
  return orders.find((o) => Math.abs(Number(o.fromTokenQty) - qty) <= qty * 1e-6) ?? null;
}

export async function agenticSwap(fromToken: string, toToken: string, qty: number, log: (line: string) => void = () => {}): Promise<AgenticFill> {
  const since = Date.now() - 60_000;
  const placed = await baw(["market-order", "swap", "--binanceChainId", "56", "--fromTokenQty", String(qty), "--fromToken", fromToken, "--toToken", toToken, "--slippage", "1"]);
  log(`agentic order placed: ${JSON.stringify(placed).slice(0, 200)}`);
  const deadline = Date.now() + ORDER_TIMEOUT_MS;
  for (;;) {
    await new Promise((r) => setTimeout(r, 5_000));
    const order = await findOrder(fromToken, toToken, qty, since);
    const status = order?.status.toUpperCase() ?? "NOT LISTED YET";
    if (order && status === "FINISHED") {
      return { orderId: order.orderId, txHash: order.txHash ?? null, sent: qty, received: Number(order.toTokenActualQty), raw: order as unknown as Record<string, unknown> };
    }
    if (order && status === "FAILED") throw new BawError(`Agentic Wallet order ${order.orderId} failed`, order);
    if (Date.now() > deadline) throw new BawError(`Agentic Wallet order still ${status.toLowerCase()} after 3 minutes`, order ?? placed);
  }
}
