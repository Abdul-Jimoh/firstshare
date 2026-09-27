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

const nyTime = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

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
    <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-2">
      <Panel
        label="New York Stock Exchange"
        status={
          <>
            <Dot on={nyOpen} />
            {SESSION_LABEL[state.session]}
          </>
        }
        detail={
          nyOpen && state.nextClose
            ? `Closes in ${until(state.nextClose, now)}`
            : `Opens ${nyTime.format(state.nextOpen)} ET, in ${until(state.nextOpen, now)}`
        }
      />
      <Panel
        label="On-chain, on Firstshare"
        status={
          <>
            <Dot on />
            Open 24/7
          </>
        }
        detail={nyOpen ? "Prices track New York live." : "Prices can drift from the last New York close. We show you by how much."}
      />
    </div>
  );
}

function Panel({ label, status, detail }: { label: string; status: React.ReactNode; detail: string }) {
  return (
    <div className="flex flex-col gap-2 bg-surface px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
      <div className="shrink-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
        <p className="mt-1 flex items-center gap-2 text-lg font-medium">{status}</p>
      </div>
      <p className="text-sm text-muted sm:max-w-56 sm:text-right">{detail}</p>
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
