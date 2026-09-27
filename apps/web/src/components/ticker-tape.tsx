"use client";

import Link from "next/link";
import { useRef } from "react";
import { formatUsd } from "@/lib/format";
import type { StockSummary } from "@/lib/stock";
import { gsap, reducedMotion, useGSAP } from "./motion/gsap";
import { StockLogo } from "./stock";

export function TickerTape({ items }: { items: StockSummary[] }) {
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (reducedMotion()) return;
      const tween = gsap.to(track.current, { xPercent: -50, ease: "none", duration: items.length * 3.4, repeat: -1 });
      const el = root.current!;
      const slow = () => gsap.to(tween, { timeScale: 0.12, duration: 0.8, ease: "power2.out" });
      const resume = () => gsap.to(tween, { timeScale: 1, duration: 0.8, ease: "power2.in" });
      el.addEventListener("pointerenter", slow);
      el.addEventListener("pointerleave", resume);
      return () => {
        el.removeEventListener("pointerenter", slow);
        el.removeEventListener("pointerleave", resume);
      };
    },
    { scope: root, dependencies: [items.length] },
  );

  return (
    <div
      ref={root}
      className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden border-y border-line bg-surface/60 py-4 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]"
    >
      <div ref={track} className="flex w-max">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 gap-3 pr-3" aria-hidden={copy === 1}>
            {items.map((s) => (
              <Link
                key={s.ticker}
                href={`/stocks/${s.ticker}`}
                tabIndex={copy ? -1 : 0}
                className="flex items-center gap-2.5 rounded-full px-3 py-1.5 transition hover:bg-bg"
              >
                <StockLogo stock={s} size={24} />
                <span className="font-mono text-sm">{s.ticker}</span>
                <span className="text-sm text-muted">{formatUsd(s.price)}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
