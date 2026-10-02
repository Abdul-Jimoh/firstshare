"use client";

import { useMemo, useRef, useState } from "react";
import { formatUsd } from "@/lib/format";

export interface ChartPoint {
  t: number;
  putIn: number;
  worth: number;
}

// Validated pair (dataviz validate_palette, light, surface #faf8f5): all checks pass, CVD ΔE 8.7.
const WORTH = "#2f7a4e";
const PUT_IN = "#c47a1c";

const W = 640;
const H = 260;
const PAD = { top: 16, right: 72, bottom: 28, left: 8 };

const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function compactUsd(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `$${Math.round(n)}`;
}

export function BacktestChart({ points }: { points: ChartPoint[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const t0 = points[0]!.t;
    const t1 = points.at(-1)!.t;
    const max = Math.max(1, ...points.flatMap((p) => [p.putIn, p.worth])) * 1.08;
    const x = (t: number) => PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);
    const path = (key: "putIn" | "worth") => points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
    const ticks = [0, max / 2 / 1.08, max / 1.08].map((v) => ({ v, y: y(v) }));
    const months: { t: number; x: number }[] = [];
    for (const p of points) {
      const d = new Date(p.t);
      if (d.getUTCDate() <= 7 && (months.length === 0 || p.t - months.at(-1)!.t > 50 * 86_400_000)) months.push({ t: p.t, x: x(p.t) });
    }
    return { x, y, worth: path("worth"), putIn: path("putIn"), ticks, months: months.filter((_, i) => i % 2 === 0) };
  }, [points]);

  const last = points.at(-1)!;
  const active = hover === null ? null : points[hover]!;

  const onMove = (e: React.PointerEvent) => {
    const rect = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(geo.x(points[i]!.t) - px) < Math.abs(geo.x(points[best]!.t) - px)) best = i;
    setHover(best);
  };

  return (
    <figure className="relative">
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-2">
          <svg width="18" height="4" aria-hidden>
            <line x1="0" y1="2" x2="18" y2="2" stroke={WORTH} strokeWidth="2" strokeLinecap="round" />
          </svg>
          What the plan was worth
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="18" height="4" aria-hidden>
            <line x1="0" y1="2" x2="18" y2="2" stroke={PUT_IN} strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" />
          </svg>
          Money put in
        </span>
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        aria-label={`Plan worth ${formatUsd(last.worth)} against ${formatUsd(last.putIn)} put in`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {geo.ticks.map((tk) => (
          <g key={tk.v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={tk.y} y2={tk.y} stroke="var(--color-line)" strokeWidth="1" />
            <text x={W - PAD.right + 8} y={tk.y + 4} className="fill-muted text-[11px]">
              {compactUsd(tk.v)}
            </text>
          </g>
        ))}
        {geo.months.map((m) => (
          <text key={m.t} x={m.x} y={H - 8} className="fill-muted text-[11px]" textAnchor="middle">
            {monthFmt.format(m.t)}
          </text>
        ))}
        <path d={geo.putIn} fill="none" stroke={PUT_IN} strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
        <path d={geo.worth} fill="none" stroke={WORTH} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={geo.x(last.t)} cy={geo.y(last.worth)} r="4" fill={WORTH} stroke="var(--color-surface)" strokeWidth="2" />
        {active && (
          <g>
            <line x1={geo.x(active.t)} x2={geo.x(active.t)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-ink)" strokeOpacity="0.25" />
            <circle cx={geo.x(active.t)} cy={geo.y(active.putIn)} r="4" fill={PUT_IN} stroke="var(--color-surface)" strokeWidth="2" />
            <circle cx={geo.x(active.t)} cy={geo.y(active.worth)} r="4" fill={WORTH} stroke="var(--color-surface)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {active && (
        <div
          className="pointer-events-none absolute top-8 rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-soft"
          style={geo.x(active.t) > W / 2 ? { right: `${(1 - geo.x(active.t) / W) * 100 + 2}%` } : { left: `${(geo.x(active.t) / W) * 100 + 2}%` }}
        >
          <p className="text-xs text-muted">{dayFmt.format(active.t)}</p>
          <p className="mt-1 font-medium">Worth {formatUsd(active.worth)}</p>
          <p className="text-muted">Put in {formatUsd(active.putIn)}</p>
        </div>
      )}
      <details className="mt-3 text-sm text-muted">
        <summary className="cursor-pointer select-none hover:text-ink">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-xs uppercase tracking-wide">
              <th className="py-1 font-normal">Week of</th>
              <th className="py-1 font-normal">Put in</th>
              <th className="py-1 font-normal">Worth</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.t} className="border-t border-line text-ink">
                <td className="py-1">{dayFmt.format(p.t)}</td>
                <td className="py-1">{formatUsd(p.putIn)}</td>
                <td className="py-1">{formatUsd(p.worth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
