import { BawError, baw, pick } from "./agentic-wallet.ts";

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

// The order is placed on Binance's side; its final state (and the on-chain hash) arrives through `market-order list`.
export async function agenticSwap(fromToken: string, toToken: string, qty: number, log: (line: string) => void = () => {}): Promise<AgenticFill> {
  const placed = await baw(["market-order", "swap", "--binanceChainId", "56", "--fromTokenQty", String(qty), "--fromToken", fromToken, "--toToken", toToken, "--slippage", "1"]);
  const orderId = pick(placed, ["orderId", "order_id", "id"]) ?? String(placed.orderId ?? "");
  if (!orderId) throw new BawError("market-order swap returned no order id", placed);
  log(`agentic order ${orderId} placed: ${JSON.stringify(placed).slice(0, 300)}`);
  const deadline = Date.now() + ORDER_TIMEOUT_MS;
  for (;;) {
    const res = await baw(["market-order", "list", "--orderId", orderId]);
    const order = ((res.list as Record<string, unknown>[] | undefined)?.[0] ?? res) as Record<string, unknown>;
    const status = String(order.status ?? order.orderStatus ?? "").toUpperCase();
    if (status === "FINISHED" || status === "SUCCESS") {
      const received = Number(order.toTokenQty ?? order.toCoinAmount ?? order.toTokenAmount ?? order.receivedQty ?? NaN);
      return { orderId, txHash: pick(order, ["txHash", "transactionHash", "hash", "txId"]) ?? null, sent: qty, received, raw: order };
    }
    if (status === "FAILED" || status === "CANCELLED" || status === "CANCELED") throw new BawError(`Agentic Wallet order ${orderId} ${status.toLowerCase()}`, order);
    if (Date.now() > deadline) throw new BawError(`Agentic Wallet order ${orderId} still ${status || "pending"} after 3 minutes`, order);
    await new Promise((r) => setTimeout(r, 5_000));
  }
}
