import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { Reveal } from "@/components/motion/reveal";
import { LiveSearch } from "@/components/search";
import { StockCard, StockRow } from "@/components/stock";
import { findStocks, getCatalog, pickStocks } from "@/lib/data";
import { COLLECTIONS, summarize } from "@/lib/stock";

export const metadata: Metadata = { title: "Explore · Firstshare" };

const PAGE = 40;

export default async function Explore({ searchParams }: { searchParams: Promise<{ q?: string; c?: string; all?: string }> }) {
  const { q = "", c, all } = await searchParams;
  const collection = COLLECTIONS.find((x) => x.slug === c);

  return (
    <div className="pt-8">
      <h1 className="text-title font-medium">{collection ? collection.title : "Explore"}</h1>
      <p className="mt-4 max-w-xl text-lg text-muted">
        {collection ? collection.blurb : "Every company and fund you can own on Firstshare. Start typing a name."}
      </p>
      <div className="mt-8">
        <Suspense>
          <LiveSearch key={collection?.slug ?? "all"} defaultValue={q} />
        </Suspense>
      </div>
      <nav className="mt-6 flex flex-wrap gap-2 text-sm">
        <Chip href="/stocks" active={!collection && !q}>
          All
        </Chip>
        {COLLECTIONS.map((x) => (
          <Chip key={x.slug} href={`/stocks?c=${x.slug}`} active={x.slug === c}>
            {x.title}
          </Chip>
        ))}
      </nav>
      <div className="mt-10">
        {q ? <Results q={q} /> : collection ? <Collection tickers={collection.tickers} /> : <Everything showAll={all === "1"} />}
      </div>
    </div>
  );
}

async function Results({ q }: { q: string }) {
  const results = await findStocks(q);
  if (!results.length) {
    return (
      <div className="rounded-card border border-line bg-surface p-12 text-center">
        <p className="text-lg font-medium">Nothing called &ldquo;{q}&rdquo; yet.</p>
        <p className="mt-1 text-muted">Try the company name, like &ldquo;Apple&rdquo;, or its ticker, like &ldquo;AAPL&rdquo;.</p>
      </div>
    );
  }
  return (
    <>
      <p className="mb-4 text-sm text-muted">
        {results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{q}&rdquo;
      </p>
      <Reveal key={q} mask stagger={0.08} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {results.map((s) => (
          <StockCard key={s.ticker} stock={summarize(s)} />
        ))}
      </Reveal>
    </>
  );
}

async function Collection({ tickers }: { tickers: readonly string[] }) {
  const stocks = await pickStocks(tickers);
  return (
    <Reveal mask stagger={0.08} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {stocks.map((s) => (
        <StockCard key={s.ticker} stock={summarize(s)} />
      ))}
    </Reveal>
  );
}

async function Everything({ showAll }: { showAll: boolean }) {
  const catalog = await getCatalog();
  const byName = [...catalog].sort((a, b) => a.name.localeCompare(b.name));
  const shown = showAll ? byName : byName.slice(0, PAGE);
  return (
    <>
      <Reveal className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {shown.map((s) => (
          <StockRow key={s.ticker} stock={summarize(s)} />
        ))}
      </Reveal>
      {!showAll && (
        <div className="mt-6 text-center">
          <Link
            href="/stocks?all=1"
            scroll={false}
            className="inline-block rounded-full border border-line bg-surface px-6 py-3 text-sm font-medium transition hover:border-ink/30"
          >
            Show all {catalog.length}
          </Link>
        </div>
      )}
    </>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-4 py-2 transition ${active ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-ink/30 hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}
