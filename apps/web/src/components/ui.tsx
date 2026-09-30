export function SectionLabel({ n, children, className = "" }: { n: string; children: React.ReactNode; className?: string }) {
  return (
    <p className={`font-mono text-xs uppercase tracking-[0.14em] text-muted ${className}`}>
      {n} / {children}
    </p>
  );
}

export function Bracket({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`inline-flex items-center gap-3 font-mono text-xs uppercase tracking-[0.18em] text-muted ${className}`}>
      <span aria-hidden className="h-5 w-2 border-y border-l border-ink/40" />
      {children}
      <span aria-hidden className="h-5 w-2 border-y border-r border-ink/40" />
    </p>
  );
}

export function Dot({ tone = "open" }: { tone?: "open" | "warn" | "paused" | "closed" }) {
  const color = { open: "bg-gain", warn: "bg-warn", paused: "bg-loss", closed: "bg-muted/50" }[tone];
  return <span aria-hidden className={`inline-block size-1.5 shrink-0 rounded-full ${color}`} />;
}
