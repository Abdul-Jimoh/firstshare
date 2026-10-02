"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useSignMessage } from "wagmi";
import type { Plan, PlanEvent, SavedPlan } from "@firstshare/core";
import { actionMessage, type PlanAction } from "@/lib/plan-auth";
import { formatShares, formatUsd } from "@/lib/format";
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

export function StartPlan({ plan }: { plan: Plan }) {
  const { isConnected } = useConnection();
  const sign = useSignedAction();
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const start = async () => {
    if (!isConnected) return setConnecting(true);
    setBusy(true);
    setError(null);
    try {
      const signed = await sign({ kind: "start", plan, mode: "paper" });
      await send("/api/plans", "POST", { plan, mode: "paper", ...signed });
      setStarted(true);
      window.dispatchEvent(new Event(CHANGED));
    } catch (e) {
      setError(walletError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      {started ? (
        <p className="font-medium text-gain">Started in practice mode. It shows up under Your plans.</p>
      ) : (
        <button onClick={start} disabled={busy} className="rounded-full bg-ink px-6 py-3 font-medium text-surface transition hover:bg-ink/85 disabled:opacity-40">
          {busy ? "Check your wallet…" : "Practise this plan"}
        </button>
      )}
      {!started && <p className="text-sm text-muted">Runs on live prices with pretend money. You sign once to show it&rsquo;s yours; nothing is sent.</p>}
      {error && <p className="w-full text-sm text-loss">{error}</p>}
      <Modal open={connecting} onClose={() => setConnecting(false)} title="Connect a wallet" center>
        <p className="mb-5 text-muted">Your plans are saved to your wallet address. Practice mode never moves any money.</p>
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
            Practice · {saved.status === "active" ? "running" : "paused"} · started {timeFmt.format(saved.createdAt)}
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
      <p className="mt-4 text-sm">
        Practice money put in: <strong>{formatUsd(putIn)}</strong>
        {holdings.length > 0 && <> · holding {holdings.map(([t, h]) => `${formatShares(h.shares)} ${t}`).join(", ")}</>}
      </p>
      {saved.events.length > 0 && (
        <ul className="mt-4 grid gap-2 border-t border-line pt-4 text-sm">
          {saved.events.slice(0, 8).map((e, i) => (
            <li key={`${e.t}-${i}`} className="flex gap-3">
              <span aria-hidden className={`w-3 shrink-0 ${EVENT_STYLE[e.kind].tone}`}>
                {EVENT_STYLE[e.kind].mark}
              </span>
              <span className="min-w-0 flex-1">{e.text}</span>
              <span className="shrink-0 text-muted">{timeFmt.format(e.t)}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 text-sm text-loss">{error}</p>}
    </article>
  );
}
