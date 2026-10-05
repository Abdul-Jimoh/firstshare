import { randomUUID } from "node:crypto";
import { ERC8183Client, JobStatus, buildJobDescription, resolveErc8183Network } from "@bnbagent/sdk/erc8183";
import { USDT_BSC } from "@firstshare/core";
import { encodeFunctionData, erc20Abi, type Hex } from "viem";
import { AgenticWalletProvider, agenticWalletAddress, contractCall } from "./agentic-wallet.ts";

export const CHECKER = {
  agentId: 361660,
  address: "0x86502596665183ef82047A8c9772eB25Dbb01b14",
  invokeUrl:
    "https://bedrock-agentcore.eu-central-1.amazonaws.com/runtimes/arn%3Aaws%3Abedrock-agentcore%3Aeu-central-1%3A040949441028%3Aruntime%2Ffirstsharechecker-RmW82x6XtT/invocations?qualifier=DEFAULT",
  tokenUrl: "https://bnbagent-040949441028.auth.eu-central-1.amazoncognito.com/oauth2/token",
  clientId: "4ueislsh493rjmkdj30js6jc5n",
  scope: "bnbagent-seller/invoke",
} as const;

// The SDK default RPC (bsc-dataseed) serves receipts but refuses eth_getLogs, and publicnode is the
// reverse, so results are read back through a separate read-only client.
const LOGS_RPC = "https://bsc-rpc.publicnode.com";

// expiredAt = now + disputeWindow + this. The seller must submit before expiredAt - disputeWindow, and the job can
// only be settled from submittedAt + disputeWindow, so this is also the time left to settle before the job expires.
const SUBMIT_WINDOW_MINUTES = 24 * 60;

async function accessToken(): Promise<string> {
  const secret = process.env.CHECKER_CLIENT_SECRET;
  if (!secret) throw new Error("CHECKER_CLIENT_SECRET is not set");
  const res = await fetch(CHECKER.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${CHECKER.clientId}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: CHECKER.scope }),
  });
  if (!res.ok) throw new Error(`Checker token request failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function a2a(data: Record<string, unknown>, sessionId: string): Promise<Record<string, unknown>> {
  const res = await fetch(CHECKER.invokeUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "message/send",
      params: { message: { messageId: randomUUID(), role: "user", parts: [{ kind: "data", data }] } },
    }),
  });
  const body = (await res.json()) as { result?: { parts?: { kind: string; data?: Record<string, unknown> }[] }; error?: unknown };
  const part = body.result?.parts?.find((p) => p.kind === "data")?.data;
  if (!res.ok || !part) throw new Error(`Checker call failed: ${res.status} ${JSON.stringify(body).slice(0, 500)}`);
  return part;
}

export interface CheckOrder {
  ticker: string;
  amountUsd: number;
}

export interface PaidCheck {
  jobId: number;
  priceAtomic: bigint;
  txs: { label: string; hash: Hex }[];
  deliverableUrl: string;
  result: Record<string, unknown>;
}

type Log = (line: string) => void;

export async function connect(log: Log = () => {}) {
  const txs: PaidCheck["txs"] = [];
  const wallet = new AgenticWalletProvider(await agenticWalletAddress(), (label, hash) => {
    txs.push({ label, hash });
    log(`${label}: ${hash}`);
  });
  const client = await ERC8183Client.create({ walletProvider: wallet, network: "bsc-mainnet" });
  return { wallet, client, txs };
}

// The SDK sends its own ERC-20 approval as a raw signed transaction, which the Agentic Wallet can't produce,
// so the allowance is granted through the wallet first and fund() then skips its approval.
async function ensureAllowance(c: Awaited<ReturnType<typeof connect>>, amount: bigint) {
  const spender = c.client.commerce.address;
  if ((await c.client.tokenAllowanceFor(USDT_BSC, c.wallet.address, spender)) >= amount) return;
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] });
  const { txHash } = await contractCall(c.wallet.address, USDT_BSC, data);
  c.wallet.onTx("erc20.approve", txHash);
  await c.client.publicClient.waitForTransactionReceipt({ hash: txHash });
}

async function fundAndDeliver(c: Awaited<ReturnType<typeof connect>>, jobId: bigint, price: bigint, sessionId: string, log: Log): Promise<PaidCheck> {
  if ((await c.client.getJobStatus(jobId)) === JobStatus.OPEN) {
    await ensureAllowance(c, price);
    await c.client.fund(jobId, price, { approveFloor: price, expectedToken: USDT_BSC });
    log(`job ${jobId} funded`);
  }
  if ((await c.client.getJobStatus(jobId)) === JobStatus.FUNDED) {
    const ack = await a2a({ skill: "notify_funded", job_id: Number(jobId) }, sessionId);
    log(`notify_funded: ${JSON.stringify(ack).slice(0, 200)}`);
  }

  const deadline = Date.now() + 5 * 60_000;
  while ((await c.client.getJobStatus(jobId)) !== JobStatus.SUBMITTED) {
    if (Date.now() > deadline) throw new Error(`job ${jobId} not submitted within 5 minutes`);
    await new Promise((r) => setTimeout(r, 5_000));
  }
  const reader = await ERC8183Client.create({ network: { ...resolveErc8183Network("bsc-mainnet"), rpcUrl: LOGS_RPC } });
  // The log RPC can trail the one that reported SUBMITTED by a few blocks and rejects ranges past its head.
  let deliverableUrl: string | null = null;
  for (let attempt = 0; attempt < 18 && !deliverableUrl; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 5_000));
    deliverableUrl = await reader.getDeliverableUrl(jobId).catch(() => null);
  }
  if (!deliverableUrl) throw new Error(`job ${jobId} submitted but its result couldn't be read yet`);
  const manifest = (await (await fetch(deliverableUrl)).json()) as { response?: { content?: string } };
  const result = JSON.parse(manifest.response?.content ?? "{}") as Record<string, unknown>;
  return { jobId: Number(jobId), priceAtomic: price, txs: c.txs, deliverableUrl, result };
}

export async function buyCheck(order: CheckOrder, log: Log = () => {}, onJob: (jobId: number) => Promise<void> = async () => {}): Promise<PaidCheck> {
  const sessionId = `firstshare-runner-${randomUUID()}`;
  const quote = await a2a(
    {
      skill: "negotiate",
      task_description: JSON.stringify(order),
      terms: { deliverables: "Firstshare pre-trade check JSON", quality_standards: "live quotes against the New York price", currency: USDT_BSC },
    },
    sessionId,
  );
  const response = quote.response as { accepted?: boolean; terms?: { price?: string; currency?: string } } | undefined;
  if (!response?.accepted || !response.terms?.price) throw new Error(`Checker declined: ${JSON.stringify(quote).slice(0, 500)}`);
  if (response.terms.currency?.toLowerCase() !== USDT_BSC.toLowerCase()) throw new Error(`Checker quoted in ${response.terms.currency}, not USDT`);
  const price = BigInt(response.terms.price);
  log(`quote: ${price} USDT wei, negotiation ${String(quote.negotiation_hash).slice(0, 10)}…`);

  const c = await connect(log);
  const verdict = await c.client.verifyNegotiationQuote(quote, { expectedProvider: CHECKER.address, expectedCurrency: USDT_BSC });
  if (!verdict.valid) throw new Error(`Checker quote signature invalid: ${JSON.stringify(verdict)}`);

  const disputeWindow = Number(await c.client.policy.disputeWindow());
  const expiredAt = BigInt(Math.floor(Date.now() / 1000) + disputeWindow + SUBMIT_WINDOW_MINUTES * 60);
  const created = await c.client.createJobWithToken({ asset: USDT_BSC, provider: CHECKER.address, expiredAt, description: buildJobDescription(quote) });
  if (created.jobId === null) throw new Error(`createJob returned no job id (tx ${created.transactionHash})`);
  const jobId = created.jobId;
  log(`job ${jobId} created`);
  await onJob(Number(jobId));
  await c.client.registerJob(jobId);
  await c.client.setBudget(jobId, price);
  return fundAndDeliver(c, jobId, price, sessionId, log);
}

// Picks up a job this wallet already created and budgeted, e.g. after a failure part-way through.
export async function resumeCheck(jobId: number, log: Log = () => {}): Promise<PaidCheck> {
  const c = await connect(log);
  const job = await c.client.getJob(BigInt(jobId));
  return fundAndDeliver(c, BigInt(jobId), job.budget, `firstshare-runner-${randomUUID()}`, log);
}
