"use client";

import { useEffect, useState } from "react";
import { usMarketState } from "@firstshare/core/market-hours";

const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const LABEL = { regular: "NYSE open", premarket: "Pre-market", afterhours: "After hours", closed: "NYSE closed" } as const;

export function NyClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  if (!now) return <span className="hidden h-9 w-44 lg:block" />;
  const [hh, mm] = parts
    .formatToParts(now)
    .filter((p) => p.type === "hour" || p.type === "minute")
    .map((p) => p.value);
  const session = usMarketState(now).session;

  return (
    <span className="hidden items-center gap-2 text-sm lg:flex" title="Time in New York">
      <span className="flex items-center gap-1 font-mono">
        <span className="rounded-full border border-ink/70 px-2 py-0.5">{hh}</span>:
        <span className="rounded-full border border-ink/70 px-2 py-0.5">{mm}</span>
      </span>
      <span className="font-medium">ET</span>
      <span className="flex items-center gap-1.5 text-muted">
        <span className={`size-1.5 rounded-full ${session === "regular" ? "bg-gain" : "bg-muted/60"}`} />
        {LABEL[session]}
      </span>
    </span>
  );
}
