import { createPublicClient, http, isAddress } from "viem";
import { bsc } from "viem/chains";
import { actionMessage, type PlanAction } from "./plan-auth";

const MAX_AGE_MS = 10 * 60_000;
const chain = createPublicClient({ chain: bsc, transport: http("https://bsc-dataseed.bnbchain.org") });

export interface Signed {
  owner: string;
  issuedAt: string;
  signature: `0x${string}`;
}

// publicClient.verifyMessage also accepts ERC-1271 smart-account signatures, which some wallets return.
export async function verifyAction(action: PlanAction, signed: Signed): Promise<string | null> {
  if (!isAddress(signed.owner)) return "That isn't a wallet address.";
  const age = Date.now() - Date.parse(signed.issuedAt);
  if (!(age >= -60_000 && age <= MAX_AGE_MS)) return "That signature has expired. Sign again.";
  const message = await actionMessage(action, signed.owner, signed.issuedAt);
  const ok = await chain.verifyMessage({ address: signed.owner, message, signature: signed.signature }).catch(() => false);
  return ok ? null : "The signature doesn't match this wallet.";
}
