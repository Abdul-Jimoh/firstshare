"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useSignMessage } from "wagmi";
import type { PendingAction, Plan, PlanEvent, PlanMode, SavedPlan } from "@firstshare/core";
import { actionMessage, type PlanAction } from "@/lib/plan-auth";
import { formatShares, formatUsd } from "@/lib/format";
import { BuyFlow } from "./buy-flow";
import { Modal, WalletList } from "./wallet";

const CHANGED = "firstshare:plans-changed";

const walletError = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  if (/reject|denied|cancel/i.test(m)) return "You cancelled in your wallet. Nothing changed.";
  return m.split("\n")[0] ?? "Your wallet couldn't sign this.";
};

function useSignedAction() {
  const { address } = useConnection();
  const { mutateAsync } = useSignMessage();
  return useCallback(
    async (action: PlanAction) => {
      if (!address) throw new Error("Connect a wallet first.");
      const issuedAt = new Date().toISOString();
      const signature = await mutateAsync({ message: await actionMessage(action, address, issuedAt) });
      return { owner: address, issuedAt, signature };
    },
    [address, mutateAsync],
  );
}

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

const RUNNER_WALLET = process.env.NEXT_PUBLIC_RUNNER_AGENTIC_WALLET ?? null;

const MODES: { mode: PlanMode; title: string; body: string; button: string; done: string }[] = [
  {
    mode: "paper",
    title: "Practice",
    body: "Runs on live prices with pretend money. Nothing is ever sent.",
    button: "Start practising",
    done: "Started in practice mode.",
  },
  {
    mode: "ask",
    title: "Ask me first",
    body: "When a buy is due and the price is fair, it waits here. You approve it and buy from your own wallet.",
    button: "Start, and ask me first",
    done: "Started. Buys will wait for your approval.",
  },
  {
    mode: "auto",
    title: "Run it for me",
    body: "Real money. Our Checker agent confirms the price, then a Binance Agentic Wallet buys automatically. On this site it's limited to the wallet that runs Firstshare's runner; run your own runner to use yours.",
    button: "Start with real money",
    done: "Started. Checked buys go through automatically.",
  },
];

export function StartPlan({ plan }: { plan: Plan }) {
  const { isConnected } = useConnection();
  const sign = useSignedAction();
  const [mode, setMode] = useState<PlanMode>("paper");
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<PlanMode | null>(null);
  const chosen = MODES.find((m) => m.mode === mode)!;

  const start = async () => {
    if (!isConnected) return setConnecting(true);
    setBusy(true);
    setError(null);
    try {
      const executor = mode === "auto" ? RUNNER_WALLET : null;
      const signed = await sign({ kind: "start", plan, mode, executor });
      await send("/api/plans", "POST", { plan, mode, ...signed });
      setStarted(mode);
      window.dispatchEvent(new Event(CHANGED));
    } catch (e) {
      setError(walletError(e));
    } finally {
      setBusy(false);
    }
  };

  if (started) return <p className="font-medium text-gain">{MODES.find((m) => m.mode === started)!.done} It shows up under Your plans.</p>;

  return (
    <div className="grid gap-4">
      <div role="radiogroup" aria-label="How should this plan run?" className="grid gap-2">
        {MODES.map((m) => {
          const unavailable = m.mode === "auto" && !RUNNER_WALLET;
          return (
            <button
              key={m.mode}
              role="radio"
              aria-checked={mode === m.mode}
              disabled={unavailable}
              onClick={() => setMode(m.mode)}
              className={`rounded-2xl border px-4 py-3 text-left transition disabled:opacity-40 ${mode === m.mode ? "border-ink bg-bg" : "border-line hover:border-ink/30"}`}
            >
              <span className="flex items-center gap-2 font-medium">
                <span className={`size-3 rounded-full border ${mode === m.mode ? "border-[4px] border-ink" : "border-ink/40"}`} />
                {m.title}
                {m.mode === "auto" && <span className="rounded-full bg-accent/25 px-2 py-0.5 text-xs font-normal">real money</span>}
              </span>
              <span className="mt-1 block pl-5 text-sm text-muted">{unavailable ? "Not set up on this server yet." : m.body}</span>
            </button>
          );
        })}
      </div>
      {mode === "auto" && RUNNER_WALLET && (
        <p className="rounded-2xl bg-accent/15 px-4 py-3 text-sm">
          Buys use the Agentic Wallet <span className="font-mono">{RUNNER_WALLET.slice(0, 6)}…{RUNNER_WALLET.slice(-4)}</span>. Each one pays the Checker
          agent 0.01 USDT first, and only goes ahead if both it and the wallet&rsquo;s own quote are close to the New York price.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button onClick={start} disabled={busy} className="rounded-full bg-ink px-6 py-3 font-medium text-surface transition hover:bg-ink/85 disabled:opacity-40">
          {busy ? "Check your wallet…" : chosen.button}
        </button>
        <p className="text-sm text-muted">You sign once to show the plan is yours. Signing sends nothing.</p>
      </div>
      {error && <p className="text-sm text-loss">{error}</p>}
      <Modal open={connecting} onClose={() => setConnecting(false)} title="Connect a wallet" center>
        <p className="mb-5 text-muted">Your plans are saved to your wallet address.</p>
        <WalletList onConnected={() => setConnecting(false)} />
      </Modal>
    </div>
  );
}

type PlanWithEvents = SavedPlan & { events: PlanEvent[] };

const REFRESH_MS = 60_000;

export function MyPlans() {
  const { address, isConnected } = useConnection();
  const [plans, setPlans] = useState<PlanWithEvents[] | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    if (!address) return setPlans(null);
    const res = await fetch(`/api/plans?owner=${address}`);
    if (res.ok) setPlans(((await res.json()) as { plans: PlanWithEvents[] }).plans);
  }, [address]);

  useEffect(() => {
    void load();
    const id = setInterval(load, REFRESH_MS);
    window.addEventListener(CHANGED, load);
    return () => {
      clearInterval(id);
      window.removeEventListener(CHANGED, load);
    };
  }, [load]);

  if (!mounted || !isConnected) return null;
  return (
    <section className="mt-16">
      <h2 className="text-subhead">Your plans</h2>
      {plans === null ? (
        <p className="mt-4 text-muted">Loading…</p>
      ) : plans.length === 0 ? (
        <p className="mt-4 text-muted">Nothing running yet. Read a plan above and practise it.</p>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {plans.map((p) => (
            <PlanCard key={p.id} saved={p} onChange={load} />
          ))}
        </div>
      )}
    </section>
  );
}

const MODE_NAME: Record<PlanMode, string> = { paper: "Practice", ask: "Ask me first", auto: "Run it for me" };

function PendingBuy({ saved, pending, onChange }: { saved: PlanWithEvents; pending: PendingAction; onChange: () => void }) {
  const sign = useSignedAction();
  const [buying, setBuying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorded = async (txHash: string) => {
    try {
      await send(`/api/plans/${saved.id}/fill`, "POST", { actionId: pending.id, txHash });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const skip = async () => {
    setBusy(true);
    setError(null);
    try {
      const signed = await sign({ kind: "dismiss", id: saved.id, actionId: pending.id });
      await send(`/api/plans/${saved.id}`, "PATCH", { action: "dismiss", actionId: pending.id, ...signed });
      onChange();
    } catch (e) {
      setError(walletError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-ink/20 bg-bg p-4">
      <p className="text-sm font-medium">Waiting for you</p>
      <p className="mt-1 text-sm">{pending.headline}</p>
      {pending.side === "buy" ? (
        <div className="mt-3 flex gap-2">
          <button onClick={() => setBuying(true)} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-surface transition hover:bg-ink/85">
            Buy {formatUsd(pending.usd)} of {pending.ticker} now
          </button>
          <button onClick={skip} disabled={busy} className="rounded-full border border-line px-4 py-2 text-sm transition hover:border-ink/30 disabled:opacity-40">
            Skip this one
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">Sell from your wallet when you&rsquo;re ready; Firstshare doesn&rsquo;t sell for you in this mode.</p>
          <button onClick={skip} disabled={busy} className="rounded-full border border-line px-4 py-2 text-sm transition hover:border-ink/30 disabled:opacity-40">
            Done
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-loss">{error}</p>}
      {buying && (
        <BuyFlow ticker={pending.ticker} name={pending.ticker} amountUsd={pending.usd} open={buying} onClose={() => setBuying(false)} onBought={(hash) => void recorded(hash)} />
      )}
    </div>
  );
}

const timeFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const EVENT_STYLE: Record<PlanEvent["kind"], { mark: string; tone: string }> = {
  bought: { mark: "●", tone: "text-gain" },
  sold: { mark: "●", tone: "text-accent-ink" },
  waiting: { mark: "◌", tone: "text-warn" },
  skipped: { mark: "–", tone: "text-muted" },
  pending: { mark: "?", tone: "text-ink" },
  error: { mark: "!", tone: "text-loss" },
  note: { mark: "·", tone: "text-muted" },
};

function PlanCard({ saved, onChange }: { saved: PlanWithEvents; onChange: () => void }) {
  const sign = useSignedAction();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const holdings = Object.entries(saved.state.holdings).filter(([, h]) => h.shares > 0);
  const putIn = Object.values(saved.state.spentByMonth).reduce((a, b) => a + b, 0);

  const act = async (kind: "pause" | "resume" | "delete") => {
    setBusy(true);
    setError(null);
    try {
      const signed = await sign({ kind, id: saved.id });
      await send(`/api/plans/${saved.id}`, "PATCH", { action: kind, ...signed });
      onChange();
    } catch (e) {
      setError(walletError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-card border border-line bg-surface p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">{saved.plan.name}</h3>
          <p className="mt-1 text-sm text-muted">
            {MODE_NAME[saved.mode]} · {saved.status === "active" ? "running" : "paused"} · started {timeFmt.format(saved.createdAt)}
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <button disabled={busy} onClick={() => act(saved.status === "active" ? "pause" : "resume")} className="rounded-full border border-line px-3 py-1.5 transition hover:border-ink/30 disabled:opacity-40">
            {saved.status === "active" ? "Pause" : "Resume"}
          </button>
          <button disabled={busy} onClick={() => act("delete")} className="rounded-full border border-line px-3 py-1.5 text-muted transition hover:border-loss/40 hover:text-loss disabled:opacity-40">
            Delete
          </button>
        </div>
      </div>
      <ol className="mt-4 grid gap-1 text-sm">
        {saved.ruleText.map((r, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-mono text-muted">{i + 1}</span>
            {r}
            {saved.waiting[i] && <span className="text-warn">· waiting for a fair price</span>}
          </li>
        ))}
      </ol>
      {Object.values(saved.pending ?? {}).map((p) => (
        <PendingBuy key={p.id} saved={saved} pending={p} onChange={onChange} />
      ))}
      <p className="mt-4 text-sm">
        {saved.mode === "paper" ? "Practice money put in" : "Put in"}: <strong>{formatUsd(putIn)}</strong>
        {holdings.length > 0 && <> · holding {holdings.map(([t, h]) => `${formatShares(h.shares)} ${t}`).join(", ")}</>}
      </p>
      {saved.events.length > 0 && (
        <ul className="mt-4 grid gap-2 border-t border-line pt-4 text-sm">
          {saved.events.slice(0, 8).map((e, i) => (
            <li key={`${e.t}-${i}`} className="flex gap-3">
              <span aria-hidden className={`w-3 shrink-0 ${EVENT_STYLE[e.kind].tone}`}>
                {EVENT_STYLE[e.kind].mark}
              </span>
              <span className="min-w-0 flex-1">
                {e.text}
                {e.tx && (
                  <>
                    {" "}
                    <a href={`https://bscscan.com/tx/${e.tx}`} target="_blank" rel="noreferrer" className="underline decoration-ink/30 underline-offset-2 hover:decoration-ink">
                      View transaction
                    </a>
                  </>
                )}
              </span>
              <span className="shrink-0 text-muted">{timeFmt.format(e.t)}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 text-sm text-loss">{error}</p>}
    </article>
  );
}
