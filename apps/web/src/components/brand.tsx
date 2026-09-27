import Link from "next/link";

export function Mark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M16 2 A14 14 0 0 1 30 16 L16 16 Z" fill="var(--color-accent)" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
      <Link href="/" className="flex items-center gap-2 text-[1.35rem] font-semibold tracking-tight">
        <Mark />
        firstshare
      </Link>
      <nav className="hidden items-center gap-1 rounded-full border border-line bg-surface p-1 text-sm sm:flex">
        <NavLink href="/stocks">Explore</NavLink>
        <NavLink href="/#how">How it works</NavLink>
        <NavLink href="/#trust">Is it safe?</NavLink>
      </nav>
      <Link href="/stocks" className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink/85">
        Start with $1
      </Link>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-full px-4 py-2 text-muted transition hover:bg-bg hover:text-ink">
      {children}
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-24 max-w-6xl border-t border-line px-5 py-10 text-sm text-muted sm:px-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row">
        <p>Tokenized stocks on BNB Smart Chain. You hold them in your own wallet.</p>
        <p>Not investment advice. Prices move, and you can lose money.</p>
      </div>
    </footer>
  );
}
