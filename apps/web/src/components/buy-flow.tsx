"use client";

import { useCallback, useEffect, useState } from "react";
import { erc20Abi, parseEventLogs, type Hex } from "viem";
import { bsc } from "viem/chains";
import { useConnection, usePublicClient, useSendTransaction, useSwitchChain } from "wagmi";
import type { EvmTx } from "@firstshare/core";
import { formatShares, formatUsd } from "@/lib/format";
import type { Prepared } from "@/lib/trade";
import { shortAddress } from "@/lib/wallet";
import { Modal, WalletList } from "./wallet";

type Swap = Extract<Prepared, { step: "swap" }>;
type Stage =
  | { kind: "preparing" }
  | { kind: "blocked"; reason: string }
  | { kind: "approve"; tx: EvmTx; amountUsd: number }
  | { kind: "approving"; hash?: Hex }
  | { kind: "review"; order: Swap }
  | { kind: "confirming"; order: Swap }
  | { kind: "pending"; order: Swap; hash: Hex }
  | { kind: "done"; order: Swap; hash: Hex; feeBnb: number | null }
  | { kind: "failed"; message: string; hash?: Hex };

const toRequest = (tx: EvmTx) => ({
  to: tx.to as Hex,
  data: tx.data as Hex,
  value: BigInt(tx.value || "0"),
  ...(tx.gasPrice ? { gasPrice: BigInt(tx.gasPrice) } : {}),
});

const walletError = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  if (/reject|denied|cancel/i.test(m)) return "You cancelled in your wallet. Nothing was sent.";
  return m.split("\n")[0] ?? "Your wallet couldn't send this.";
};

export function BuyFlow({
  ticker,
  name,
  amountUsd,
  open,
  onClose,
  onBought,
}: {
  ticker: string;
  name: string;
  amountUsd: number;
  open: boolean;
  onClose: () => void;
  onBought?: (hash: Hex) => void;
}) {
  const { address, chainId, isConnected } = useConnection();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const client = usePublicClient({ chainId: bsc.id });
  const [stage, setStage] = useState<Stage>({ kind: "preparing" });

  const onBsc = chainId === bsc.id;

  const prepare = useCallback(async (): Promise<Prepared> => {
    const res = await fetch("/api/trade/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticker, usd: amountUsd, wallet: address }),
    });
    return (await res.json()) as Prepared;
  }, [ticker, amountUsd, address]);

  const load = useCallback(async () => {
    setStage({ kind: "preparing" });
    try {
      const p = await prepare();
      if (p.step === "blocked") setStage({ kind: "blocked", reason: p.reason });
      else if (p.step === "approve") setStage({ kind: "approve", tx: p.tx, amountUsd: p.amountUsd });
      else setStage({ kind: "review", order: p });
    } catch {
      setStage({ kind: "blocked", reason: "We couldn't prepare the order just now. Try again in a moment." });
    }
  }, [prepare]);

  useEffect(() => {
    if (open && isConnected && onBsc && address) load();
  }, [open, isConnected, onBsc, address, load]);

  const approve = async (tx: EvmTx) => {
    try {
      setStage({ kind: "approving" });
      const hash = await sendTransactionAsync(toRequest(tx));
      setStage({ kind: "approving", hash });
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success")
        return setStage({ kind: "failed", message: "The approval didn't go through. No USDT was spent.", hash });
      await load();
    } catch (e) {
      setStage({ kind: "failed", message: walletError(e) });
    }
  };

  const confirm = async (current: Swap) => {
    try {
      setStage({ kind: "confirming", order: current });
      const fresh = await prepare();
      if (fresh.step !== "swap") return fresh.step === "blocked" ? setStage({ kind: "blocked", reason: fresh.reason }) : load();
      const hash = await sendTransactionAsync(toRequest(fresh.tx));
      setStage({ kind: "pending", order: fresh, hash });
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success")
        return setStage({
          kind: "failed",
          message: "The purchase reverted on-chain. Your USDT stayed in your wallet; only the network fee was used.",
          hash,
        });
      const feeBnb = Number(receipt.gasUsed * receipt.effectiveGasPrice) / 1e18;
      const received = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs })
        .filter((l) => l.address.toLowerCase() === fresh.tokenAddress && l.args.to.toLowerCase() === address!.toLowerCase())
        .reduce((sum, l) => sum + l.args.value, 0n);
      const shares = received > 0n ? (Number(received) / 10 ** fresh.decimals) * fresh.sharesPerToken : fresh.shares;
      setStage({ kind: "done", order: { ...fresh, shares, perShare: fresh.amountUsd / shares }, hash, feeBnb });
      onBought?.(hash);
    } catch (e) {
      setStage({ kind: "failed", message: walletError(e) });
    }
  };

  const title = stage.kind === "done" ? "You own it" : `Buy ${formatUsd(amountUsd)} of ${name}`;

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {!isConnected || !address ? (
        <>
          <p className="mb-5 text-muted">Connect the wallet that holds your USDT on BNB Smart Chain.</p>
          <WalletList />
        </>
      ) : !onBsc ? (
        <Step
          title="Switch to BNB Smart Chain"
          body="Tokenized stocks on Firstshare live on BNB Smart Chain. Your wallet will ask to switch."
        >
          <Primary onClick={() => switchChain({ chainId: bsc.id })} busy={switching}>
            {switching ? "Check your wallet…" : "Switch network"}
          </Primary>
        </Step>
      ) : (
        <Body
          stage={stage}
          amountUsd={amountUsd}
          address={address}
          onApprove={approve}
          onConfirm={confirm}
          onRetry={load}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function Body({
  stage,
  amountUsd,
  address,
  onApprove,
  onConfirm,
  onRetry,
  onClose,
}: {
  stage: Stage;
  amountUsd: number;
  address: string;
  onApprove: (tx: EvmTx) => void;
  onConfirm: (order: Swap) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  switch (stage.kind) {
    case "preparing":
      return <Wait text="Checking your wallet and doing a dry run of the order…" />;
    case "blocked":
      return (
        <Step title="Not yet" body={stage.reason}>
          <Secondary onClick={onRetry}>Check again</Secondary>
        </Step>
      );
    case "approve":
      return (
        <Step
          title="Allow Firstshare to use your USDT"
          body={`A one-time permission for exactly $${stage.amountUsd.toFixed(2)} of USDT, so the swap can take it. It costs a tiny network fee and doesn't move any money.`}
        >
          <Primary onClick={() => onApprove(stage.tx)}>Allow ${stage.amountUsd.toFixed(2)} USDT</Primary>
        </Step>
      );
    case "approving":
      return <Wait text={stage.hash ? "Waiting for the network to confirm your permission…" : "Confirm the permission in your wallet…"} />;
    case "review":
    case "confirming": {
      const o = stage.order;
      const busy = stage.kind === "confirming";
      return (
        <div>
          <dl className="divide-y divide-line rounded-2xl bg-card text-sm">
            <Row label="You pay" value={`${formatUsd(amountUsd)} USDT`} />
            <Row label="You get about" value={`${formatShares(o.shares)} share${o.shares >= 2 ? "s" : ""} of ${o.name}`} />
            {o.minShares !== null && (
              <Row label="Guaranteed at least" value={`${formatShares(o.minShares)} share${o.minShares >= 2 ? "s" : ""}`} />
            )}
            <Row label="Price per share" value={formatUsd(o.perShare)} />
            <Row label="Bought as" value={`${o.issuer} ${o.symbol}`} />
            {o.feeBnb !== null && <Row label="Network fee" value={`about ${o.feeBnb.toFixed(6)} BNB`} />}
            <Row label="From wallet" value={shortAddress(address)} />
          </dl>
          <p className="mt-4 flex gap-2 text-sm text-muted">
            <span aria-hidden className="text-gain">
              ✓
            </span>
            Dry run passed: we simulated this exact order on-chain before asking you to sign.
          </p>
          <p className="mt-2 text-sm text-muted">{o.headline}</p>
          <Primary onClick={() => onConfirm(o)} busy={busy} className="mt-6">
            {busy ? "Getting the latest price…" : `Confirm purchase`}
          </Primary>
        </div>
      );
    }
    case "pending":
      return <Wait text="Sent. Waiting for BNB Smart Chain to confirm, usually a few seconds…" hash={stage.hash} />;
    case "done": {
      const o = stage.order;
      return (
        <div>
          <p className="text-lg leading-snug">
            You now own about <strong className="font-medium">{formatShares(o.shares)}</strong> share{o.shares >= 2 ? "s" : ""} of {o.name},
            bought for {formatUsd(amountUsd)}.
          </p>
          <dl className="mt-6 divide-y divide-line rounded-2xl bg-card text-sm">
            <Row label="Price per share" value={formatUsd(o.perShare)} />
            <Row label="Held as" value={`${o.issuer} ${o.symbol}, in your wallet`} />
            {stage.feeBnb !== null && <Row label="Network fee paid" value={`${stage.feeBnb.toFixed(6)} BNB`} />}
          </dl>
          <p className="mt-4 text-sm text-muted">
            It rises and falls with {o.name}&apos;s real share price. You can hold it as long as you like, or sell any time.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={`https://bscscan.com/tx/${stage.hash}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border-[1.5px] border-ink px-5 py-3 text-sm font-semibold transition hover:bg-card"
            >
              Proof on BscScan ↗
            </a>
            <Secondary onClick={onClose}>Done</Secondary>
          </div>
        </div>
      );
    }
    case "failed":
      return (
        <Step title="That didn't go through" body={stage.message}>
          <div className="flex flex-wrap gap-3">
            <Primary onClick={onRetry}>Try again</Primary>
            {stage.hash && (
              <a
                href={`https://bscscan.com/tx/${stage.hash}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border-[1.5px] border-ink px-5 py-3 text-sm font-semibold"
              >
                View on BscScan ↗
              </a>
            )}
          </div>
        </Step>
      );
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function Step({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-muted">{body}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function Wait({ text, hash }: { text: string; hash?: Hex }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-1 size-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
      <div>
        <p>{text}</p>
        {hash && (
          <a
            href={`https://bscscan.com/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm text-muted underline decoration-line underline-offset-4"
          >
            Follow it on BscScan ↗
          </a>
        )}
      </div>
    </div>
  );
}

function Primary({
  children,
  onClick,
  busy,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`w-full rounded-full bg-accent px-6 py-4 text-sm font-semibold text-ink transition hover:bg-accent-ink disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

function Secondary({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-full border-[1.5px] border-ink px-5 py-3 text-sm font-semibold transition hover:bg-card">
      {children}
    </button>
  );
}
