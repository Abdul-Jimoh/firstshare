import type { W3Client } from "./binance/client.ts";
import { BSC, USDT_BSC } from "./binance/api.ts";
import type { QuoteRoute } from "./binance/types.ts";

export interface EvmTx {
  from: string;
  to: string;
  data: string;
  value: string;
  gas: string | null;
  gasPrice: string | null;
}

export interface Simulation {
  status: "SUCCESS" | "FAILED";
  failReason: string | null;
  balanceChanges: { contractAddress: string; tokenType: string; change: string; owner: string }[];
}

export interface ApprovalPlan {
  spender: string;
  tx: EvmTx;
}

export interface SwapPlan {
  mode: QuoteRoute["executionMode"];
  vendor: string;
  tx: EvmTx | null;
  toTokenAmount: bigint;
  minReceive: bigint | null;
}

export class TradeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradeError";
  }
}

export async function planApproval(client: W3Client, owner: string, amount: bigint, token = USDT_BSC): Promise<ApprovalPlan> {
  const [item] = await client.get<{ data: string; dexContractAddress: string; gasLimit: string; gasPrice: string }[]>(
    "/api/v1/dex/aggregator/approve-transaction",
    { binanceChainId: BSC, tokenContractAddress: token, approveAmount: amount.toString() },
  );
  if (!item) throw new TradeError("Couldn't prepare the approval.");
  return {
    spender: item.dexContractAddress,
    tx: { from: owner, to: token, data: item.data, value: "0", gas: item.gasLimit, gasPrice: item.gasPrice },
  };
}

export async function planSwap(
  client: W3Client,
  p: { wallet: string; toToken: string; amount: bigint; slippagePercent?: number; fromToken?: string },
): Promise<SwapPlan> {
  const fromToken = p.fromToken ?? USDT_BSC;
  const common = { binanceChainId: BSC, fromTokenAddress: fromToken, toTokenAddress: p.toToken, amount: p.amount.toString() };
  const routes = await client.get<QuoteRoute[]>("/api/v1/dex/aggregator/quote", { ...common, userWalletAddress: p.wallet });
  const route = routes.find((r) => r.isBest) ?? routes[0];
  if (!route) throw new TradeError("No one is offering this right now.");
  if (route.executionMode === "RFQ") {
    return { mode: "RFQ", vendor: route.vendorName, tx: null, toTokenAmount: BigInt(route.toTokenAmount), minReceive: null };
  }

  const swap = await client.get<{
    tx: {
      from: string;
      to: string;
      data: string;
      value: string | number;
      gas: string | number;
      gasPrice: string | number;
      minReceiveAmount?: string;
    };
    routerResult: { toTokenAmount: string; vendorName: string };
  }>("/api/v1/dex/aggregator/swap", {
    ...common,
    quoteId: route.quoteId,
    userWalletAddress: p.wallet,
    slippagePercent: String(p.slippagePercent ?? 1),
  });

  return {
    mode: "SWAP",
    vendor: swap.routerResult.vendorName,
    tx: {
      from: swap.tx.from,
      to: swap.tx.to,
      data: swap.tx.data,
      value: String(swap.tx.value ?? "0"),
      gas: swap.tx.gas ? String(swap.tx.gas) : null,
      gasPrice: swap.tx.gasPrice ? String(swap.tx.gasPrice) : null,
    },
    toTokenAmount: BigInt(swap.routerResult.toTokenAmount),
    minReceive: swap.tx.minReceiveAmount ? BigInt(swap.tx.minReceiveAmount) : null,
  };
}

export async function simulate(client: W3Client, tx: EvmTx): Promise<Simulation> {
  const r = await client.post<Simulation>("/api/v1/dex/pre-transaction/simulate", {
    binanceChainId: BSC,
    evmTx: { from: tx.from, to: tx.to, value: tx.value, data: tx.data },
  });
  return { ...r, failReason: r.failReason || null };
}

export interface TxStatus {
  status: "pending" | "success" | "fail" | "unknown";
  feeBnb: string | null;
  transfers: { token: string; symbol: string; amount: string; from: string; to: string }[];
}

export async function txStatus(client: W3Client, txHash: string): Promise<TxStatus> {
  const rows = await client.get<
    {
      txStatus: "success" | "fail" | "pending";
      txFee: string;
      tokenTransferDetails?: { tokenContractAddress: string; symbol: string; amount: string; from: string; to: string }[];
    }[]
  >("/api/v1/dex/post-transaction/transaction-detail-by-txhash", { binanceChainId: BSC, txHash });
  const row = rows[0];
  if (!row) return { status: "unknown", feeBnb: null, transfers: [] };
  return {
    status: row.txStatus,
    feeBnb: row.txFee ?? null,
    transfers: (row.tokenTransferDetails ?? []).map((t) => ({
      token: t.tokenContractAddress,
      symbol: t.symbol,
      amount: t.amount,
      from: t.from,
      to: t.to,
    })),
  };
}

export function explainRevert(reason: string | null): string {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("exceeds allowance")) return "Firstshare doesn't have permission to spend your USDT yet.";
  if (r.includes("exceeds balance") || r.includes("insufficientbalance")) return "Your wallet doesn't have enough USDT for this.";
  if (r.includes("slippage") || r.includes("too little received") || r.includes("min return"))
    return "The price moved while preparing the order. Try again.";
  return "This order would fail on-chain, so we stopped before you paid any fees.";
}

export async function balances(
  client: W3Client,
  owner: string,
  tokens: string[],
): Promise<Map<string, { raw: bigint; amount: number; priceUsd: number }>> {
  const res = await client.post<
    { tokenAssets: { tokenContractAddress: string; balance: string; rawBalance: string; tokenPrice: string }[] }[]
  >("/api/v1/dex/balance/token-balances-by-address", {
    address: owner,
    tokenContractAddresses: tokens.map((t) => ({ binanceChainId: BSC, tokenContractAddress: t })),
    excludeRiskToken: "1",
  });
  const out = new Map<string, { raw: bigint; amount: number; priceUsd: number }>();
  for (const a of res.flatMap((r) => r.tokenAssets ?? [])) {
    out.set(a.tokenContractAddress.toLowerCase(), {
      raw: a.rawBalance ? BigInt(a.rawBalance) : 0n,
      amount: Number(a.balance) || 0,
      priceUsd: Number(a.tokenPrice) || 0,
    });
  }
  return out;
}
