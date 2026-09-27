"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatShares, formatUsd } from "@/lib/format";
import { displayName, type StockSummary } from "@/lib/stock";
import { gsap, reducedMotion, useGSAP, whenVisible } from "./motion/gsap";
import { StockLogo } from "./stock";

const PRESETS = [1, 5, 20, 100, 500];
const ARC = 2 * Math.PI * 25;

export function SliceCalculator({ stocks, compact = false }: { stocks: StockSummary[]; compact?: boolean }) {
  const priced = stocks.filter((s) => s.price);
  const [ticker, setTicker] = useState(priced[0]?.ticker);
  const [amount, setAmount] = useState(compact ? 10 : 1);
  const slice = useRef<SVGCircleElement>(null);
  const shown = useRef<HTMLSpanElement>(null);

  const stock = priced.find((s) => s.ticker === ticker) ?? priced[0];
  const shares = stock?.price ? amount / stock.price : 0;
  const whole = Math.floor(shares);
  const part = shares - whole;
  const visible = useRef(false);
  const latest = useRef({ part, shares });
  latest.current = { part, shares };

  const animate = useRef<{ offset: gsap.QuickToFunc; count: (n: number) => void } | null>(null);

  useGSAP(
    (_, contextSafe) => {
      const el = slice.current!;
      if (reducedMotion()) return;
      const counter = { n: 0 };
      const render = () => {
        if (shown.current) shown.current.textContent = formatShares(counter.n);
      };
      animate.current = {
        offset: gsap.quickTo(el, "strokeDashoffset", { duration: 1.1, ease: "expo.out" }),
        count: contextSafe!((n: number) => {
          gsap.to(counter, { n, duration: 1.1, ease: "expo.out", overwrite: true, onUpdate: render });
        }),
      };
      return whenVisible(el, () => {
        visible.current = true;
        animate.current?.offset(ARC * (1 - latest.current.part));
        animate.current?.count(latest.current.shares);
      });
    },
    { dependencies: [] },
  );

  useEffect(() => {
    if (!animate.current) {
      slice.current?.setAttribute("stroke-dashoffset", String(ARC * (1 - part)));
      return;
    }
    if (!visible.current) return;
    animate.current.offset(ARC * (1 - part));
    animate.current.count(shares);
  }, [part, shares]);

  const pct = useMemo(() => (part * 100 < 1 ? (part * 100).toFixed(2) : (part * 100).toFixed(1)), [part]);
  if (!stock) return null;

  return (
    <div className={`grid items-center gap-8 sm:gap-10 ${compact ? "" : "lg:grid-cols-2 lg:gap-16"}`}>
      <div className={`relative mx-auto aspect-square w-full ${compact ? "max-w-44" : "max-w-64 sm:max-w-88"}`}>
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle cx="60" cy="60" r="56" fill="var(--color-surface)" stroke="var(--color-line)" strokeWidth="1" />
          <circle
            ref={slice}
            cx="60"
            cy="60"
            r="25"
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="50"
            strokeDasharray={ARC}
            strokeDashoffset={ARC}
          />
        </svg>
        {whole > 0 && (
          <div className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-surface px-3 py-1.5 text-xs shadow-sm">
            {Array.from({ length: Math.min(whole, 5) }, (_, i) => (
              <span key={i} className="size-3 rounded-full bg-ink" />
            ))}
            <span className="ml-1 text-muted">
              {whole > 5 ? `+${whole - 5} ` : ""}
              {whole} whole share{whole === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>

      <div>
        {!compact && (
          <div className="flex flex-wrap gap-2">
            {priced.map((s) => (
              <button
                key={s.ticker}
                onClick={() => setTicker(s.ticker)}
                className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 text-sm transition ${s.ticker === stock.ticker ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-ink/30 hover:text-ink"}`}
              >
                <StockLogo stock={s} size={26} />
                {displayName(s)}
              </button>
            ))}
          </div>
        )}

        <p className={compact ? "text-2xl font-medium leading-tight tracking-tight" : "mt-8 text-lead font-medium sm:mt-10"}>
          {formatUsd(amount)} buys you <span ref={shown}>{formatShares(shares)}</span>
          <span className="text-muted">
            {" "}
            of {whole >= 1 ? "" : "one "}
            {displayName(stock)} share{shares >= 2 ? "s" : ""}.
          </span>
        </p>
        <p className={`mt-3 text-muted ${compact ? "text-sm" : ""}`}>
          {whole >= 1
            ? `${whole} whole share${whole === 1 ? "" : "s"} plus ${pct}% of another.`
            : `That's ${pct}% of one share. Small, but it's yours, and it moves with the real price.`}{" "}
          One share costs {formatUsd(stock.price)}.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2 sm:mt-8">
          {(compact ? PRESETS.slice(0, 4) : PRESETS).map((p) => (
            <button
              key={p}
              onClick={() => setAmount(p)}
              className={`rounded-full border px-4 py-2 text-sm transition ${amount === p ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-ink/30 hover:text-ink"}`}
            >
              ${p}
            </button>
          ))}
        </div>
        <input
          type="range"
          min={1}
          max={1000}
          step={1}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          aria-label="Amount in dollars"
          className="mt-6 w-full accent-ink"
        />
      </div>
    </div>
  );
}
