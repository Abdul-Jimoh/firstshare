"use client";

import { useState } from "react";
import type { Plan } from "@firstshare/core";
import type { BacktestView } from "@/lib/plan";
import type { ParsedPlan } from "@/lib/plan-parse";
import { formatUsd } from "@/lib/format";
import { BacktestChart } from "./backtest-chart";
import { StartPlan } from "./my-plans";

const EXAMPLES = [
  "Put $10 into Apple every Monday.",
  "Buy $20 of Nvidia when it drops 8% from its recent high, and sell half if I'm up 25%.",
  "$25 into the S&P 500 on the 1st of every month, never more than $100 a month.",
];

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: "Something went wrong." }));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data as T;
}

export function PlanBuilder() {
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [parsed, setParsed] = useState<ParsedPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<BacktestView | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const backtest = async (plan: Plan) => {
    setTesting(true);
    setTestError(null);
    try {
      setResult(await post<BacktestView>("/api/plan/backtest", { plan }));
    } catch (e) {
      setTestError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const read = async (input = text) => {
    if (!input.trim()) return;
    setReading(true);
    setError(null);
    setParsed(null);
    setResult(null);
    try {
      const p = await post<ParsedPlan>("/api/plan/parse", { text: input });
      setParsed(p);
      if (p.plan && p.problems.length === 0) void backtest(p.plan);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="grid gap-6">
      <section className="rounded-card border border-line bg-surface p-5 shadow-soft sm:p-6">
        <label htmlFor="plan-text" className="text-sm font-medium">
          Describe your plan
        </label>
        <textarea
          id="plan-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void read();
          }}
          rows={3}
          maxLength={1000}
          placeholder="e.g. Put $10 into Apple every Monday, and buy an extra $20 when it drops 5%."
          className="mt-3 w-full resize-y rounded-2xl border border-line bg-bg px-4 py-3 text-base outline-none transition placeholder:text-muted/70 focus:border-ink/40"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setText(ex);
                void read(ex);
              }}
              className="rounded-full border border-line px-3 py-1.5 text-left text-sm text-muted transition hover:border-ink/30 hover:text-ink"
            >
              {ex}
            </button>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-4">
          <button
            onClick={() => void read()}
            disabled={reading || !text.trim()}
            className="rounded-full bg-ink px-6 py-3 font-medium text-surface transition hover:bg-ink/85 disabled:opacity-40"
          >
            {reading ? "Reading your plan…" : "Read my plan"}
          </button>
          {error && <p className="text-sm text-loss">{error}</p>}
        </div>
      </section>

      {parsed && <RuleCard parsed={parsed} />}

      {(testing || result || testError) && (
        <section className="rounded-card border border-line bg-surface p-5 shadow-soft sm:p-6">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">If you had started this plan a while ago</p>
          {testing && <p className="mt-4 text-muted">Replaying the plan on past prices…</p>}
          {testError && <p className="mt-4 text-loss">{testError}</p>}
          {result && !testing && <BacktestSummary result={result} />}
        </section>
      )}

      {parsed?.plan && parsed.problems.length === 0 && result && !testing && <StartPlan plan={parsed.plan} />}
    </div>
  );
}

function RuleCard({ parsed }: { parsed: ParsedPlan }) {
  const { plan } = parsed;
  return (
    <section className="rounded-card bg-card p-5 sm:p-6">
      {plan ? (
        <>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Your plan</p>
          <h2 className="mt-2 text-subhead">{plan.name}</h2>
          <ol className="mt-5 grid gap-3">
            {parsed.rules.map((r, i) => (
              <li key={i} className="flex gap-3 rounded-2xl bg-surface px-4 py-3">
                <span className="font-mono text-sm text-muted">{i + 1}</span>
                <span>{r}</span>
              </li>
            ))}
            {plan.monthlyCapUsd !== null && (
              <li className="flex gap-3 rounded-2xl bg-surface px-4 py-3">
                <span className="font-mono text-sm text-muted">≤</span>
                <span>Never spend more than {formatUsd(plan.monthlyCapUsd)} in a month.</span>
              </li>
            )}
            <li className="flex gap-3 rounded-2xl border border-dashed border-ink/20 px-4 py-3 text-muted">
              <span aria-hidden>✓</span>
              <span>Every buy is checked against the real New York price first, and skipped if it&rsquo;s overpriced.</span>
            </li>
          </ol>
        </>
      ) : (
        <p className="text-lg font-medium">We couldn&rsquo;t turn that into a plan yet.</p>
      )}
      {parsed.problems.length > 0 && <Notes title="Needs a fix" items={parsed.problems} tone="text-loss" />}
      {parsed.assumptions.length > 0 && <Notes title="We assumed" items={parsed.assumptions} />}
      {parsed.unsupported.length > 0 && <Notes title="We can't do this part yet" items={parsed.unsupported} />}
    </section>
  );
}

function Notes({ title, items, tone = "text-muted" }: { title: string; items: string[]; tone?: string }) {
  return (
    <div className="mt-5">
      <p className="text-sm font-medium">{title}</p>
      <ul className={`mt-1 list-disc pl-5 text-sm ${tone}`}>
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function BacktestSummary({ result }: { result: BacktestView }) {
  if (result.putIn === 0) {
    return <p className="mt-4">This plan wouldn&rsquo;t have bought anything between {dateFmt.format(result.start)} and {dateFmt.format(result.end)}.</p>;
  }
  const worth = result.value + result.takenOut;
  const up = result.profit >= 0;
  const pct = result.returnPct === null ? "" : `${up ? "+" : "−"}${Math.abs(result.returnPct * 100).toFixed(1)}%`;
  const buys = result.trades.filter((t) => t.side === "buy").length;
  const sells = result.trades.length - buys;
  return (
    <>
      <p className="mt-3 text-lg">
        Starting {dateFmt.format(result.start)}, you&rsquo;d have put in <strong>{formatUsd(result.putIn)}</strong> and it would be worth{" "}
        <strong>{formatUsd(worth)}</strong> today.
      </p>
      <div className="mt-5 grid grid-cols-3 gap-3">
        <Stat label={up ? "Gain" : "Loss"} value={pct} tone={up ? "text-gain" : "text-loss"} />
        <Stat label="Buys" value={String(buys)} />
        <Stat label="Sells" value={String(sells)} />
      </div>
      <div className="mt-6">
        <BacktestChart points={result.points.map((p) => ({ t: p.t, putIn: p.putIn, worth: p.value + p.takenOut }))} />
      </div>
      {result.skippedForCap > 0 && (
        <p className="mt-3 text-sm text-muted">
          {result.skippedForCap} buy{result.skippedForCap === 1 ? " was" : "s were"} skipped to stay under your monthly limit.
        </p>
      )}
      <p className="mt-4 text-sm text-muted">
        Replayed day by day on the on-chain price of {result.sources.map((s) => s.symbol).join(", ")}, including about 0.1% cost per trade. It
        doesn&rsquo;t include the New York price check, and past prices don&rsquo;t predict future ones.
      </p>
    </>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-bg px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${tone}`}>{value}</p>
    </div>
  );
}
