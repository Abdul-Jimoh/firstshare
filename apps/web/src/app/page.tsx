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
import { getCatalog, pickStocks } from "@/lib/data";
import { COLLECTIONS, summarize } from "@/lib/stock";

const TAPE = [
  "AAPL",
  "NVDA",
  "TSLA",
  "AMZN",
  "MSFT",
  "GOOGL",
  "META",
  "NFLX",
  "SPY",
  "QQQ",
  "AMD",
  "AVGO",
  "TSM",
  "COIN",
  "PLTR",
  "MU",
  "ORCL",
  "IBM",
];
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
      <section className="pb-16 pt-12 text-center sm:pt-20">
        <HeroHeadline />
        <Reveal delay={0.5} y={16}>
          <p className="mx-auto mt-8 max-w-xl text-lg text-muted">
            Real US stocks, held in your own wallet. We tell you what you&apos;re buying and whether now is a fair price, in plain English.
          </p>
        </Reveal>
        <Reveal delay={0.65} y={16} className="relative z-20 mt-10 flex justify-center">
          <HeroSearch />
        </Reveal>
        <Reveal delay={0.8} y={16} stagger={0.1} className="mx-auto mt-16 grid max-w-3xl grid-cols-3 gap-6 text-left sm:gap-10">
          <Stat value={<CountUp value={catalog.length} />} label="companies and funds" />
          <Stat value="$1" label="smallest buy" />
          <Stat value={<CountUp value={allDay} />} label="trade 24/7, even on weekends" />
        </Reveal>
      </section>

      <TickerTape items={tape.map(summarize)} />

      <Reveal className="mt-16">
        <MarketClock initialNow={new Date().toISOString()} />
      </Reveal>

      <section className="mt-32">
        <SplitHeading className="max-w-3xl text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1] tracking-[-0.04em]">
          What does $1 actually buy? <span className="text-muted">A real slice.</span>
        </SplitHeading>
        <Reveal className="mt-12 rounded-card border border-line bg-surface p-6 sm:p-12">
          <SliceCalculator stocks={slice.map(summarize)} />
        </Reveal>
      </section>

      <section className="mt-32 space-y-20">
        {COLLECTIONS.map((c, i) => (
          <div key={c.slug}>
            <div className="mb-8 flex items-end justify-between gap-6">
              <div>
                <SplitHeading className="text-[clamp(1.6rem,3vw,2.25rem)] font-medium tracking-[-0.03em]">{c.title}</SplitHeading>
                <p className="mt-1 text-muted">{c.blurb}</p>
              </div>
              <Link href={`/stocks?c=${c.slug}`} className="group flex shrink-0 items-center gap-1.5 text-sm font-medium">
                See all
                <Arrow className="size-4 transition group-hover:translate-x-1" />
              </Link>
            </div>
            <Reveal stagger={0.08} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {collections[i]?.map((s) => (
                <StockCard key={s.ticker} stock={summarize(s)} />
              ))}
            </Reveal>
          </div>
        ))}
      </section>

      <section id="how" className="mt-36 scroll-mt-28">
        <SplitHeading className="max-w-2xl text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1] tracking-[-0.04em]">
          Three steps. <span className="text-muted">No jargon.</span>
        </SplitHeading>
        <Reveal stagger={0.12} className="mt-14 grid gap-4 sm:grid-cols-3">
          <Step
            n="1"
            title="Pick a company you know"
            body="Search by name. We show what the company does, what one share costs, and whether it's open right now."
          />
          <Step
            n="2"
            title="We check the price"
            body="Before you pay, we compare what you'd pay with the last real price in New York and tell you if it's fair."
          />
          <Step
            n="3"
            title="You own it"
            body="Confirm in your wallet. You get a receipt in plain English, and the shares are yours to hold or sell any time."
          />
        </Reveal>
      </section>

      <section id="trust" className="mt-36 scroll-mt-28">
        <SplitHeading className="max-w-2xl text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1] tracking-[-0.04em]">
          Is it safe? <span className="text-muted">Here&apos;s what&apos;s real.</span>
        </SplitHeading>
        <Reveal stagger={0.1} className="mt-14 grid gap-4 sm:grid-cols-3">
          <Trust
            icon={<ShieldIcon />}
            title="Backed by real shares"
            body="Each token is backed by an actual share held by a regulated custodian, with published reports you can open."
          />
          <Trust
            icon={<KeyIcon />}
            title="Yours, not ours"
            body="Stocks go straight to your own wallet. Firstshare never holds your money or your keys."
          />
          <Trust
            icon={<CheckIcon />}
            title="Checked before you buy"
            body="Every buy goes through our price check first. If you'd overpay, we say so, and suggest a better way or a better time."
          />
        </Reveal>
      </section>

      <Reveal className="mt-36">
        <section className="relative overflow-hidden rounded-card bg-ink px-8 py-20 text-center text-white sm:py-28">
          <Mark className="pointer-events-none absolute -right-16 -top-16 size-72 text-white/[0.06]" />
          <h2 className="mx-auto max-w-2xl text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1] tracking-[-0.04em]">
            Your first share is a search away.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-white/60">No minimum balance. No account forms. Just a wallet and a dollar.</p>
          <Magnetic className="mt-10 inline-block">
            <Link
              href="/stocks"
              className="group flex items-center gap-2 rounded-full bg-white px-7 py-4 text-sm font-medium text-ink transition hover:bg-white/90"
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
    <div>
      <p className="text-[clamp(2.25rem,5vw,3.5rem)] font-medium leading-none tracking-[-0.045em]">{value}</p>
      <p className="mt-2 text-sm text-muted">{label}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="group relative overflow-hidden rounded-card border border-line bg-surface p-7 transition duration-500 hover:-translate-y-1 hover:border-ink/15">
      <span className="absolute -right-3 -top-8 text-[9rem] font-medium leading-none tracking-[-0.06em] text-bg transition duration-500 group-hover:text-line">
        {n}
      </span>
      <p className="relative font-mono text-sm text-muted">Step {n}</p>
      <h3 className="relative mt-16 text-xl font-medium tracking-tight">{title}</h3>
      <p className="relative mt-2 text-muted">{body}</p>
    </div>
  );
}

function Trust({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="group rounded-card border border-line bg-surface p-7 transition duration-500 hover:-translate-y-1 hover:border-ink/15">
      <span className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-bg transition duration-500 group-hover:bg-ink group-hover:text-white">
        {icon}
      </span>
      <h3 className="mt-10 text-xl font-medium tracking-tight">{title}</h3>
      <p className="mt-2 text-muted">{body}</p>
    </div>
  );
}

const iconProps = {
  viewBox: "0 0 20 20",
  className: "size-5",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function ShieldIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M10 2.5 4 5v4.5c0 3.6 2.6 6.6 6 8 3.4-1.4 6-4.4 6-8V5l-6-2.5Z" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <circle cx="7" cy="12.5" r="3.5" />
      <path d="m9.5 10 7-7M14 5.5l2 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <circle cx="10" cy="10" r="7.5" />
      <path d="m6.8 10.2 2.2 2.2 4.2-4.6" />
    </svg>
  );
}
