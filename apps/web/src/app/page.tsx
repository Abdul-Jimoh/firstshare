import Link from "next/link";
import { Mark } from "@/components/brand";
import { HeroHeadline } from "@/components/hero";
import { MarketClock } from "@/components/market-clock";
import { CountUp } from "@/components/motion/count-up";
import { Magnetic } from "@/components/motion/magnetic";
import { Reveal, SplitHeading } from "@/components/motion/reveal";
import { HeroSearch } from "@/components/search";
import { SliceCalculator } from "@/components/slice";
import { Arrow, StockCard } from "@/components/stock";
import { TickerTape } from "@/components/ticker-tape";
import { Bracket, SectionLabel } from "@/components/ui";
import { getCatalog, pickStocks } from "@/lib/data";
import { COLLECTIONS, summarize } from "@/lib/stock";

// prettier-ignore
const TAPE = ["AAPL", "NVDA", "TSLA", "AMZN", "MSFT", "GOOGL", "META", "NFLX", "SPY", "QQQ", "AMD", "AVGO", "TSM", "COIN", "PLTR", "MU", "ORCL", "IBM"];
const SLICE = ["AAPL", "NVDA", "TSLA", "SPY", "AMZN", "NFLX"];

export default async function Home() {
  const [catalog, tape, slice, ...collections] = await Promise.all([
    getCatalog(),
    pickStocks(TAPE),
    pickStocks(SLICE),
    ...COLLECTIONS.map((c) => pickStocks(c.tickers.slice(0, 4))),
  ]);
  const allDay = catalog.filter((s) => s.tokens.some((t) => t.platform === "bstock")).length;

  return (
    <>
      <section className="relative pb-12 pt-8 text-center sm:pb-16 sm:pt-16">
        <div aria-hidden className="grid-lines pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2" />
        <Reveal y={10} className="mb-8 sm:mb-10">
          <Bracket>Tokenized US stocks on BNB Chain</Bracket>
        </Reveal>
        <HeroHeadline />
        <Reveal delay={0.5} y={16}>
          <p className="mx-auto mt-6 max-w-xl text-base text-muted sm:mt-8 sm:text-lg">
            Real US stocks, held in your own wallet. We tell you what you&apos;re buying and whether now is a fair price, in plain English.
          </p>
        </Reveal>
        <Reveal delay={0.65} y={16} className="relative z-20 mt-8 flex justify-center sm:mt-10">
          <HeroSearch />
        </Reveal>
        <Reveal
          delay={0.8}
          y={16}
          stagger={0.1}
          className="mx-auto mt-10 grid max-w-3xl divide-y divide-line overflow-hidden rounded-card border border-line bg-surface text-left sm:mt-16 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:rounded-none sm:border-0 sm:bg-transparent sm:text-center"
        >
          <Stat value={<CountUp value={catalog.length} />} label="companies and funds" />
          <Stat value="$1" label="smallest buy" />
          <Stat value={<CountUp value={allDay} />} label="trade 24/7, even on weekends" />
        </Reveal>
      </section>

      <TickerTape items={tape.map(summarize)} />

      <Reveal className="mt-12 sm:mt-16">
        <SectionLabel n="01" className="mb-4">
          Market hours
        </SectionLabel>
        <MarketClock initialNow={new Date().toISOString()} />
      </Reveal>

      <section className="mt-20 sm:mt-32">
        <SectionLabel n="02" className="mb-5">
          What $1 buys
        </SectionLabel>
        <SplitHeading className="max-w-3xl text-headline">
          What does $1 actually buy? <span className="text-muted">A real slice.</span>
        </SplitHeading>
        <Reveal className="mt-8 rounded-card bg-card p-5 sm:mt-12 sm:p-12">
          <SliceCalculator stocks={slice.map(summarize)} />
        </Reveal>
      </section>

      <section className="mt-20 sm:mt-32">
        <SectionLabel n="03" className="mb-8">
          Collections
        </SectionLabel>
        <div className="space-y-14 sm:space-y-20">
          {COLLECTIONS.map((c, i) => (
            <div key={c.slug}>
              <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                <div>
                  <SplitHeading className="text-subhead">{c.title}</SplitHeading>
                  <p className="mt-1 text-muted">{c.blurb}</p>
                </div>
                <Link href={`/stocks?c=${c.slug}`} className="group flex shrink-0 items-center gap-1.5 text-sm font-medium">
                  See all
                  <Arrow className="size-4 transition group-hover:translate-x-1" />
                </Link>
              </div>
              <Reveal mask stagger={0.08} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                {collections[i]?.map((s) => (
                  <StockCard key={s.ticker} stock={summarize(s)} />
                ))}
              </Reveal>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="mt-24 scroll-mt-28 sm:mt-36">
        <SectionLabel n="04" className="mb-5">
          How it works
        </SectionLabel>
        <SplitHeading className="max-w-2xl text-headline">
          Three steps. <span className="text-muted">No jargon.</span>
        </SplitHeading>
        <Reveal mask stagger={0.08} className="mt-8 grid gap-3 sm:mt-14 sm:gap-4 md:grid-cols-3">
          <Step
            n="01"
            label="Pick a company you know"
            big="Type a name."
            body="We show what the company does, what one share costs, and whether it's open right now."
          />
          <Step
            n="02"
            label="We check the price"
            big="Fair, or not?"
            body="Before you pay, we compare your price with the real one in New York and say so plainly."
          />
          <Step
            n="03"
            label="You own it"
            big="Yours to keep."
            body="Confirm in your wallet and get a receipt in plain English. Hold or sell any time."
          />
        </Reveal>
      </section>

      <section id="trust" className="mt-24 scroll-mt-28 sm:mt-36">
        <SectionLabel n="05" className="mb-5">
          Is it safe
        </SectionLabel>
        <SplitHeading className="max-w-2xl text-headline">
          Is it safe? <span className="text-muted">Here&apos;s what&apos;s real.</span>
        </SplitHeading>
        <Reveal mask stagger={0.08} className="mt-8 grid gap-3 sm:mt-14 sm:gap-4 md:grid-cols-3">
          <Step
            n="01"
            label="Backed by real shares"
            big="1 : 1 backed."
            body="Each token is backed by an actual share held by a regulated custodian, with reports you can open."
          />
          <Step
            n="02"
            label="Yours, not ours"
            big="Your wallet."
            body="Stocks go straight to your own wallet. Firstshare never holds your money or your keys."
          />
          <Step
            n="03"
            label="Checked before you buy"
            big="Dry run first."
            body="Every order is simulated before you sign. If you'd overpay, we say so and suggest a better way."
          />
        </Reveal>
      </section>

      <Reveal className="mt-24 sm:mt-36">
        <section className="relative overflow-hidden rounded-card bg-ink px-6 py-16 text-center text-surface sm:px-8 sm:py-28">
          <Mark className="pointer-events-none absolute -right-16 -top-16 size-72 text-surface/6" />
          <SectionLabel n="06" className="mb-6 text-surface/50">
            Start
          </SectionLabel>
          <h2 className="mx-auto max-w-2xl text-headline">
            Your first share is a <span className="rounded-[0.12em] bg-accent px-[0.14em] text-ink">search</span> away.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-surface/60">No minimum balance. No account forms. Just a wallet and a dollar.</p>
          <Magnetic className="mt-10 inline-block">
            <Link
              href="/stocks"
              className="group flex items-center gap-2 rounded-full bg-accent px-7 py-4 text-sm font-semibold text-ink transition hover:bg-accent-ink"
            >
              Explore companies
              <Arrow className="size-4 transition group-hover:translate-x-1" />
            </Link>
          </Magnetic>
        </section>
      </Reveal>
    </>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-4 sm:block sm:px-6 sm:py-1">
      <p className="text-stat">{value}</p>
      <p className="text-right text-sm text-muted sm:mt-2 sm:text-center">{label}</p>
    </div>
  );
}

function Step({ n, label, big, body }: { n: string; label: string; big: string; body: string }) {
  return (
    <div className="group flex min-h-72 flex-col rounded-card bg-card p-6 transition duration-500 hover:-translate-y-4 hover:cursor-pointer hover:bg-card-hover sm:min-h-96 sm:p-8">
      <p className="flex items-center gap-2 text-sm font-medium">
        <span aria-hidden className="size-1.5 rounded-full bg-ink" />
        {label}
      </p>
      <div className="flex flex-1 flex-col justify-center py-8 text-center">
        <p className="text-[clamp(1.75rem,3vw,2.4rem)] font-semibold leading-none tracking-[-0.05em]">{big}</p>
        <p className="mx-auto mt-4 max-w-72 text-sm text-muted">{body}</p>
      </div>
      <p className="font-mono text-sm">{n}</p>
    </div>
  );
}
