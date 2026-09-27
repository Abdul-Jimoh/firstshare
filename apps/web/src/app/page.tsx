import Link from "next/link";
import { MarketClock } from "@/components/market-clock";
import { SearchBox } from "@/components/search-box";
import { StockCard, StockLogo } from "@/components/stock";
import { getCatalog, pickStocks } from "@/lib/data";
import { COLLECTIONS } from "@/lib/stock";

export default async function Home() {
  const [catalog, heroStocks, ...collections] = await Promise.all([
    getCatalog(),
    pickStocks(["AAPL", "NVDA"]),
    ...COLLECTIONS.map((c) => pickStocks(c.tickers.slice(0, 4))),
  ]);
  const [apple, nvidia] = heroStocks;
  const twentyFourSeven = catalog.filter((s) => s.tokens.some((t) => t.platform === "bstock")).length;

  return (
    <>
      <section className="pb-16 pt-10 text-center sm:pt-20">
        <h1 className="mx-auto max-w-5xl text-[clamp(2.75rem,8vw,6.25rem)] font-medium leading-[0.98] tracking-[-0.045em]">
          Own a piece of
          <br />
          <span className="inline-flex flex-wrap items-center justify-center gap-x-[0.22em]">
            {apple && <StockLogo stock={apple} size={72} />}
            Apple,
            {nvidia && <StockLogo stock={nvidia} size={72} />}
            Nvidia
          </span>
          <br />
          <span className="text-muted">from $1.</span>
        </h1>
        <p className="mx-auto mt-8 max-w-xl text-lg text-muted">
          Real US stocks, held in your own wallet. We tell you what you&apos;re buying and whether now is a fair price, in plain English.
        </p>
        <div className="mt-10 flex justify-center">
          <SearchBox />
        </div>
        <dl className="mx-auto mt-16 grid max-w-3xl grid-cols-3 gap-6 text-left sm:gap-10">
          <Stat value={String(catalog.length)} label="companies and funds" />
          <Stat value="$1" label="smallest buy" />
          <Stat value={String(twentyFourSeven)} label="trade 24/7, even on weekends" />
        </dl>
      </section>

      <MarketClock initialNow={new Date().toISOString()} />

      <section className="mt-24 space-y-16">
        {COLLECTIONS.map((c, i) => (
          <div key={c.slug}>
            <div className="mb-6 flex items-end justify-between gap-6">
              <div>
                <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">{c.title}</h2>
                <p className="mt-1 text-muted">{c.blurb}</p>
              </div>
              <Link href={`/stocks?c=${c.slug}`} className="shrink-0 border-b border-ink pb-0.5 text-sm font-medium">
                See all
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {collections[i]?.map((s) => <StockCard key={s.ticker} stock={s} />)}
            </div>
          </div>
        ))}
      </section>

      <section id="how" className="mt-32 scroll-mt-8">
        <h2 className="max-w-2xl text-[clamp(2rem,5vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.035em]">
          Three steps. <span className="text-muted">No jargon.</span>
        </h2>
        <ol className="mt-12 grid gap-4 sm:grid-cols-3">
          <Step n="01" title="Pick a company you know" body="Search by name. We show what the company does, what one share costs, and whether it's open right now." />
          <Step n="02" title="We check the price" body="Before you pay, we compare what you'd pay with the last real price in New York and tell you if it's fair." />
          <Step n="03" title="You own it" body="Confirm in your wallet. You get a receipt in plain English, and the shares are yours to hold or sell any time." />
        </ol>
      </section>

      <section id="trust" className="mt-32 scroll-mt-8">
        <h2 className="max-w-2xl text-[clamp(2rem,5vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.035em]">
          Is it safe? <span className="text-muted">Here&apos;s what&apos;s real.</span>
        </h2>
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          <Trust title="Backed by real shares" body="Each token is backed by an actual share held by a regulated custodian, with published reports you can open." />
          <Trust title="Yours, not ours" body="Stocks go straight to your own wallet. Firstshare never holds your money or your keys." />
          <Trust title="Checked before you buy" body="Every buy goes through our price check first. If you'd overpay, we say so, and suggest a better way or a better time." />
        </div>
      </section>

      <section className="mt-32 rounded-card bg-ink px-8 py-16 text-center text-white sm:py-20">
        <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.035em]">Your first share is a search away.</h2>
        <Link href="/stocks" className="mt-8 inline-block rounded-full bg-white px-7 py-3.5 text-sm font-medium text-ink transition hover:bg-white/90">
          Explore companies
        </Link>
      </section>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="text-[clamp(2rem,5vw,3.25rem)] font-medium leading-none tracking-[-0.04em]">{value}</dd>
      <dd className="mt-2 text-sm text-muted">{label}</dd>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="rounded-card border border-line bg-surface p-7">
      <p className="font-mono text-sm text-muted">{n}</p>
      <h3 className="mt-10 text-xl font-medium tracking-tight">{title}</h3>
      <p className="mt-2 text-muted">{body}</p>
    </li>
  );
}

function Trust({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-7">
      <h3 className="text-xl font-medium tracking-tight">{title}</h3>
      <p className="mt-2 text-muted">{body}</p>
    </div>
  );
}
