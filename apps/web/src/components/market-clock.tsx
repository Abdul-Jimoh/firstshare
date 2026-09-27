"use client";

import { useEffect, useState } from "react";
import { usMarketState, type UsSession } from "@firstshare/core/market-hours";

const SESSION_LABEL: Record<UsSession, string> = {
  regular: "Open",
  premarket: "Pre-market",
  afterhours: "After hours",
  closed: "Closed",
};

function until(target: Date, now: Date) {
  const mins = Math.max(0, Math.round((target.getTime() - now.getTime()) / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

const localTime = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

export function MarketClock({ initialNow }: { initialNow: string }) {
  const [now, setNow] = useState(() => new Date(initialNow));
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const state = usMarketState(now);
  const nyOpen = state.session === "regular";

  return (
    <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
      <div className="flex items-center justify-between gap-4 bg-surface px-6 py-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">New York Stock Exchange</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-medium">
            <Dot on={nyOpen} />
            {SESSION_LABEL[state.session]}
          </p>
        </div>
        <p className="text-right text-sm text-muted">
          {nyOpen && state.nextClose ? (
            <>Closes in {until(state.nextClose, now)}</>
          ) : (
            <>
              Opens {localTime.format(state.nextOpen)}
              <br />
              in {until(state.nextOpen, now)}
            </>
          )}
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 bg-surface px-6 py-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">On-chain, on Firstshare</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-medium">
            <Dot on />
            Open 24/7
          </p>
        </div>
        <p className="max-w-[14rem] text-right text-sm text-muted">
          {nyOpen ? "Prices track New York live." : "Prices can drift from the last New York close. We show you by how much."}
        </p>
      </div>
    </div>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <span className={`relative inline-flex size-2.5 rounded-full ${on ? "bg-gain" : "bg-muted/50"}`}>
      {on && <span className="absolute inset-0 animate-ping rounded-full bg-gain/60" />}
    </span>
  );
}
