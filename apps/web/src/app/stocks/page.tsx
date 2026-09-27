import Link from "next/link";
import type { Metadata } from "next";
import { SearchBox } from "@/components/search-box";
import { StockCard, StockRow } from "@/components/stock";
import { findStocks, getCatalog, pickStocks } from "@/lib/data";
import { COLLECTIONS } from "@/lib/stock";

export const metadata: Metadata = { title: "Explore · Firstshare" };

const PAGE = 40;

export default async function Explore({ searchParams }: { searchParams: Promise<{ q?: string; c?: string; all?: string }> }) {
  const { q = "", c, all } = await searchParams;
  const collection = COLLECTIONS.find((x) => x.slug === c);

  return (
    <div className="pt-6">
      <h1 className="text-[clamp(2.25rem,6vw,4rem)] font-medium leading-none tracking-[-0.04em]">
        {collection ? collection.title : "Explore"}
      </h1>
      <p className="mt-3 max-w-xl text-muted">
        {collection ? collection.blurb : "Every company and fund you can own on Firstshare, by name."}
      </p>
      <div className="mt-8">
        <SearchBox defaultValue={q} size="md" autoFocus={!collection && !q} />
      </div>
      <nav className="mt-6 flex flex-wrap gap-2 text-sm">
        <Chip href="/stocks" active={!collection && !q}>All</Chip>
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
      <div className="rounded-card border border-line bg-surface p-10 text-center">
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
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {results.map((s) => <StockCard key={s.ticker} stock={s} />)}
      </div>
    </>
  );
}

async function Collection({ tickers }: { tickers: readonly string[] }) {
  const stocks = await pickStocks(tickers);
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {stocks.map((s) => <StockCard key={s.ticker} stock={s} />)}
    </div>
  );
}

async function Everything({ showAll }: { showAll: boolean }) {
  const catalog = await getCatalog();
  const byName = [...catalog].sort((a, b) => a.name.localeCompare(b.name));
  const shown = showAll ? byName : byName.slice(0, PAGE);
  return (
    <>
      <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {shown.map((s) => <StockRow key={s.ticker} stock={s} />)}
      </div>
      {!showAll && (
        <div className="mt-6 text-center">
          <Link href="/stocks?all=1" className="inline-block rounded-full border border-line bg-surface px-6 py-3 text-sm font-medium transition hover:border-ink/30">
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
      className={`rounded-full border px-4 py-2 transition ${active ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}
