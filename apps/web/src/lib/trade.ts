import { createPublicClient, erc20Abi, http, isAddress, type Address } from "viem";
import { bsc } from "viem/chains";
import { balances, clientFromEnv, explainRevert, planApproval, planSwap, simulate, txStatus, USDT_BSC, type EvmTx } from "@firstshare/core";
import { checkStock } from "./check";
import { getStock } from "./data";
import { ISSUER } from "./stock";

export const BSC_RPC = "https://bsc-dataseed.bnbchain.org";
const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const rpc = createPublicClient({ chain: bsc, transport: http(BSC_RPC) });

export type Prepared =
  | { step: "approve"; tx: EvmTx; amountUsd: number; spender: string }
  | {
      step: "swap";
      tx: EvmTx;
      amountUsd: number;
      ticker: string;
      name: string;
      issuer: string;
      symbol: string;
      tokenAddress: string;
      shares: number;
      minShares: number | null;
      perShare: number;
      verdict: string;
      headline: string;
      feeBnb: number | null;
    }
  | { step: "blocked"; reason: string };

const gasCost = (tx: EvmTx) => (tx.gas && tx.gasPrice ? BigInt(tx.gas) * BigInt(tx.gasPrice) : 0n);

export async function prepareBuy(ticker: string, amountUsd: number, wallet: string): Promise<Prepared> {
  if (!isAddress(wallet)) return { step: "blocked", reason: "That wallet address doesn't look right." };
  const stock = await getStock(ticker);
  if (!stock) return { step: "blocked", reason: "We don't have that stock." };

  const check = await checkStock(stock.ticker, amountUsd);
  const pick = check?.pick;
  if (!check || !pick) return { step: "blocked", reason: check?.headline ?? "This can't be bought right now." };
  const token = stock.tokens.find((t) => t.symbol === pick.symbol);
  if (!token) return { step: "blocked", reason: "This version is no longer listed." };

  const client = clientFromEnv();
  const amount = BigInt(Math.round(amountUsd * 100)) * 10n ** 16n;
  const [held, approval] = await Promise.all([balances(client, wallet, [USDT_BSC, ""]), planApproval(client, wallet, amount)]);
  const usdt = held.get(USDT_BSC.toLowerCase())?.raw ?? 0n;
  const bnb = held.get(NATIVE)?.raw ?? 0n;

  if (usdt < amount) {
    const have = Number(usdt) / 1e18;
    return {
      step: "blocked",
      reason: `This buy needs $${amountUsd.toFixed(2)} of USDT on BNB Smart Chain. Your wallet has $${have.toFixed(2)}.`,
    };
  }

  const allowance = await rpc.readContract({
    address: USDT_BSC as Address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [wallet as Address, approval.spender as Address],
  });
  if (allowance < amount) {
    if (bnb < gasCost(approval.tx) * 3n)
      return { step: "blocked", reason: "Add a little BNB (about $0.10 is plenty) to pay network fees." };
    const sim = await simulate(client, approval.tx);
    if (sim.status !== "SUCCESS") return { step: "blocked", reason: explainRevert(sim.failReason) };
    return { step: "approve", tx: approval.tx, amountUsd, spender: approval.spender };
  }

  const plan = await planSwap(client, { wallet, toToken: token.address, amount });
  if (plan.mode === "RFQ" || !plan.tx)
    return { step: "blocked", reason: "This version is sold through a signed-order flow Firstshare doesn't support yet." };
  if (bnb < gasCost(plan.tx) * 2n) return { step: "blocked", reason: "Add a little BNB (about $0.10 is plenty) to pay network fees." };

  const sim = await simulate(client, plan.tx);
  if (sim.status !== "SUCCESS") return { step: "blocked", reason: explainRevert(sim.failReason) };
  const received = sim.balanceChanges.find(
    (c) => c.contractAddress.toLowerCase() === token.address && c.owner.toLowerCase() === wallet.toLowerCase(),
  );
  const tokensOut = Number(received ? BigInt(received.change) : plan.toTokenAmount) / 10 ** token.decimals;
  const shares = tokensOut * token.sharesPerToken;

  return {
    step: "swap",
    tx: plan.tx,
    amountUsd,
    ticker: stock.ticker,
    name: stock.name,
    issuer: ISSUER[token.platform].name,
    symbol: token.symbol,
    tokenAddress: token.address,
    shares,
    minShares: plan.minReceive ? (Number(plan.minReceive) / 10 ** token.decimals) * token.sharesPerToken : null,
    perShare: amountUsd / shares,
    verdict: check.verdict,
    headline: check.headline,
    feeBnb: plan.tx.gas && plan.tx.gasPrice ? Number(gasCost(plan.tx)) / 1e18 : null,
  };
}

export async function tradeStatus(hash: string) {
  return txStatus(clientFromEnv(), hash);
}
