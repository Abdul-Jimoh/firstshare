import { JobStatus } from "@bnbagent/sdk/erc8183";
import type { KV } from "@firstshare/core";
import { connect } from "./checker.ts";

const KEY = "checker:jobs";

export async function rememberJob(kv: KV, jobId: number): Promise<void> {
  await kv.sadd(KEY, String(jobId));
}

// Settlement is permissionless once the dispute window has passed, so the runner pays the Checker out of escrow
// itself rather than waiting for anyone to remember. Gas comes from the Agentic Wallet.
export async function settleDueJobs(kv: KV, log: (line: string) => void): Promise<void> {
  const ids = await kv.smembers(KEY);
  if (!ids.length) return;
  const { client } = await connect();
  const window = await client.policy.disputeWindow();
  const now = BigInt(Math.floor(Date.now() / 1000));
  for (const id of ids) {
    const job = await client.getJob(BigInt(id)).catch(() => null);
    if (!job) continue;
    if (job.status === JobStatus.COMPLETED || job.status === JobStatus.REJECTED || job.status === JobStatus.EXPIRED) {
      await kv.srem(KEY, id);
      log(`checker job ${id} already final (status ${job.status})`);
      continue;
    }
    if (job.status !== JobStatus.SUBMITTED || now < job.submittedAt + window) continue;
    try {
      const tx = await client.settle(BigInt(id));
      log(`checker job ${id} settled: ${tx.transactionHash}`);
      await kv.srem(KEY, id);
    } catch (e) {
      log(`checker job ${id} settle failed: ${(e as Error).message.slice(0, 200)}`);
    }
  }
}
