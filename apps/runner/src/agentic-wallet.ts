import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { WalletProvider, type ExecutionContext, type Intent, type TxResult } from "@bnbagent/sdk/wallets";
import { encodeFunctionData, type Hex } from "viem";

const run = promisify(execFile);

export class BawError extends Error {
  constructor(
    message: string,
    readonly output: unknown,
  ) {
    super(message);
    this.name = "BawError";
  }
}

async function baw(args: string[]): Promise<Record<string, unknown>> {
  let stdout: string;
  try {
    ({ stdout } = await run("baw", [...args, "--json"], { maxBuffer: 4 << 20 }));
  } catch (e) {
    stdout = (e as { stdout?: string }).stdout ?? "";
    if (!stdout) throw e;
  }
  const out = JSON.parse(stdout) as { success?: boolean; data?: Record<string, unknown>; error?: { code?: number; message?: string } };
  if (out.success !== true) throw new BawError(`baw ${args.slice(0, 2).join(" ")} failed: ${out.error?.message ?? stdout} (${out.error?.code ?? "no code"})`, out);
  return out.data ?? {};
}

function pick(data: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = data[k];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

export async function agenticWalletAddress(chainId = "56"): Promise<`0x${string}`> {
  const data = await baw(["wallet", "address"]);
  const entry = (data.addresses as { binanceChainId: string; address: string }[]).find((a) => a.binanceChainId === chainId);
  if (!entry) throw new BawError(`no Agentic Wallet address on chain ${chainId}`, data);
  return entry.address as `0x${string}`;
}

export async function contractCall(from: string, to: string, data: Hex, value = 0n, chainId = "56"): Promise<{ txHash: Hex; preview: Record<string, unknown> }> {
  const preview = await baw(["contract-call", "preview", "--binanceChainId", chainId, "--from", from, "--to", to, "--value", value.toString(), "--inputData", data]);
  const requestId = pick(preview, ["requestId", "request_id", "id"]);
  if (!requestId) throw new BawError("contract-call preview returned no requestId", preview);
  const executed = await baw(["contract-call", "execute", "--requestId", requestId]);
  const txHash = pick(executed, ["txHash", "transactionHash", "hash", "tx_hash"]);
  if (!txHash) throw new BawError("contract-call execute returned no transaction hash", executed);
  return { txHash: txHash as Hex, preview };
}

// The Binance Agentic Wallet signs and broadcasts on Binance's side, so it plugs into the SDK as a
// self-broadcasting wallet: every intent becomes one `baw contract-call` preview + execute.
export class AgenticWalletProvider extends WalletProvider {
  static override readonly kind = "binance-agentic-wallet";

  constructor(
    readonly walletAddress: `0x${string}`,
    readonly onTx: (label: string, txHash: Hex) => void = () => {},
  ) {
    super();
  }

  get address(): `0x${string}` {
    return this.walletAddress;
  }

  override makeExecutor(context: ExecutionContext) {
    return {
      execute: async (intent: Intent): Promise<TxResult> => {
        if (!intent.call) throw new Error(`intent ${intent.name ?? "?"} has no contract call`);
        const { address, abi, functionName, args } = intent.call;
        const data = encodeFunctionData({ abi, functionName, args: args as unknown[] });
        const { txHash } = await contractCall(this.walletAddress, address, data, intent.value ?? 0n);
        this.onTx(intent.name ?? functionName, txHash);
        const receipt = await context.client.waitForTransactionReceipt({ hash: txHash, timeout: (context.receiptTimeout ?? 120) * 1000 });
        return { transactionHash: txHash, status: receipt.status === "success" ? 1 : 0, receipt };
      },
    };
  }
}
