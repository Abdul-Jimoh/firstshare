"use client";

import { useEffect, useRef, useState } from "react";
import type { Verdict } from "@firstshare/core";
import type { CheckView } from "@/lib/check";
import { formatShares, formatUsd } from "@/lib/format";
import { shortName } from "@/lib/stock";
import { BuyFlow } from "./buy-flow";
import { gsap, reducedMotion, useGSAP } from "./motion/gsap";

const PRESETS = [1, 5, 20, 100];

const nyStamp = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" });

const VERDICT: Record<Verdict, { label: string; dot: string }> = {
  good: { label: "Good price", dot: "bg-gain" },
  fair: { label: "Fair price", dot: "bg-gain" },
  pricey: { label: "A bit expensive", dot: "bg-warn" },
  avoid: { label: "Overpriced right now", dot: "bg-loss" },
  unverified: { label: "Can't verify the price", dot: "bg-muted" },
  paused: { label: "Paused", dot: "bg-warn" },
  unavailable: { label: "Not available", dot: "bg-muted" },
};

function premiumLabel(p: number | null) {
  if (p === null) return null;
  const v = Math.abs(p * 100).toFixed(Math.abs(p) < 0.001 ? 2 : 1);
  return p <= 0 ? `▼ ${v}% vs NY` : `▲ ${v}% vs NY`;
}

export function CheckCard({ ticker, name }: { ticker: string; name: string }) {
  const [amount, setAmount] = useState(10);
  const [draft, setDraft] = useState("10");
  const [check, setCheck] = useState<CheckView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/check?ticker=${encodeURIComponent(ticker)}&usd=${amount}`, { signal: ctrl.signal });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Something went wrong.");
          setCheck(null);
        } else {
          setError(null);
          setCheck(data as CheckView);
        }
      } catch {
        if (!ctrl.signal.aborted) setError("We couldn't check the price just now.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [ticker, amount, tick]);

  useGSAP(
    () => {
      if (!check || reducedMotion()) return;
      gsap.fromTo(body.current, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: "power3.out" });
    },
    { dependencies: [check?.at] },
  );

  const commitDraft = () => {
    const n = Math.round(Number(draft.replace(/[^0-9.]/g, "")) * 100) / 100;
    if (n >= 1 && n <= 10_000) setAmount(n);
    else setDraft(String(amount));
  };

  const v = check ? VERDICT[check.verdict] : null;

  return (
    <div className="rounded-card border-[1.5px] border-ink bg-surface p-5 sm:p-7">
      <BuyFlow ticker={ticker} name={shortName(name)} amountUsd={amount} open={buying} onClose={() => setBuying(false)} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Price check</p>
        <button
          onClick={() => setTick((t) => t + 1)}
          disabled={loading}
          className="rounded-full px-3 py-1 text-xs text-muted transition hover:bg-bg hover:text-ink disabled:opacity-50"
        >
          {loading ? "Checking…" : "Check again"}
        </button>
      </div>

      <label className="mt-4 flex items-center gap-2 rounded-2xl bg-card px-4 py-3">
        <span className="text-2xl font-medium text-muted">$</span>
        <input
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => e.key === "Enter" && commitDraft()}
          aria-label={`Amount of ${name} to buy, in dollars`}
          className="w-full bg-transparent text-2xl font-medium outline-none"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => {
              setAmount(p);
              setDraft(String(p));
            }}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${amount === p ? "border-ink bg-ink text-surface" : "border-line bg-surface text-muted hover:border-ink/30 hover:text-ink"}`}
          >
            ${p}
          </button>
        ))}
      </div>

      <div className="mt-6 border-t border-line pt-6" aria-live="polite">
        {error && !loading && <p className="text-muted">{error}</p>}
        {!check && !error && <Skeleton />}
        {check && v && (
          <div ref={body} className={loading ? "opacity-60 transition" : "transition"}>
            <p className="flex items-center gap-2 text-sm font-medium">
              <span className={`size-2 rounded-full ${v.dot}`} />
              {v.label}
            </p>
            <p className="mt-2 text-lg leading-snug">{check.headline}</p>

            {check.shares !== null && check.pick && (
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted">You&apos;d own about</dt>
                  <dd className="mt-1 font-medium">
                    {formatShares(check.shares)} share{check.shares >= 2 ? "s" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Bought as</dt>
                  <dd className="mt-1 font-medium">
                    {check.pick.issuer} <span className="font-mono text-xs text-muted">{check.pick.symbol}</span>
                  </dd>
                </div>
              </dl>
            )}

            {check.pick && (
              <button
                onClick={() => setBuying(true)}
                className={
                  check.verdict === "avoid"
                    ? "mt-5 w-full rounded-full border-[1.5px] border-ink px-6 py-3.5 text-sm font-semibold transition hover:bg-card"
                    : "mt-5 w-full rounded-full bg-accent px-6 py-3.5 text-sm font-semibold text-ink transition hover:bg-accent-ink"
                }
              >
                {check.verdict === "avoid" ? "Buy anyway" : `Buy ${formatUsd(check.amountUsd)} of ${shortName(name)}`}
              </button>
            )}

            {check.notes.length > 0 && (
              <ul className="mt-5 space-y-2 text-sm text-muted">
                {check.notes.map((n) => (
                  <li key={n} className="flex gap-2">
                    <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted" />
                    {n}
                  </li>
                ))}
              </ul>
            )}

            <ul className="mt-5 divide-y divide-line rounded-2xl border border-line text-sm">
              {check.options.map((o) => (
                <li key={o.symbol} className="flex items-start justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {o.issuer}
                      {o.picked && (
                        <span className="whitespace-nowrap rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-ink">
                          Our pick
                        </span>
                      )}
                    </span>
                    <span className="block font-mono text-xs text-muted">{o.symbol}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    {o.perShare !== null ? (
                      <>
                        <span className="block font-medium">{formatUsd(o.perShare)}</span>
                        <span className="block whitespace-nowrap text-xs text-muted">{premiumLabel(o.premium)}</span>
                      </>
                    ) : (
                      <span className="block max-w-40 text-xs text-muted">{o.problem}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            {check.fair && (
              <p className="mt-4 text-xs text-muted">
                New York price {formatUsd(check.fair.perShare)} a share
                {check.fair.source === "live" ? ", live from the exchange." : `, its last price (${nyStamp.format(check.fair.at)} ET).`}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 w-28 rounded-full bg-bg" />
      <div className="h-5 w-full rounded-full bg-bg" />
      <div className="h-5 w-3/4 rounded-full bg-bg" />
      <div className="mt-5 h-24 rounded-2xl bg-bg" />
    </div>
  );
}
