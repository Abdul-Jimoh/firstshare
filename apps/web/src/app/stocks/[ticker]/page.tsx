import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { StatePill, StockLogo } from "@/components/stock";
import { getStock } from "@/lib/data";
import { formatShares, formatUsd, sharesForDollars } from "@/lib/format";
import { ISSUER, preferredToken, tokenState } from "@/lib/stock";

type Props = { params: Promise<{ ticker: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const stock = await getStock((await params).ticker);
  return { title: stock ? `${stock.name} · Firstshare` : "Not found · Firstshare" };
}

export default async function StockPage({ params }: Props) {
  const stock = await getStock((await params).ticker);
  if (!stock) notFound();

  const pick = preferredToken(stock);
  const oneDollar = sharesForDollars(1, pick?.price ?? null);

  return (
    <div className="pt-6">
      <Link href="/stocks" className="text-sm text-muted transition hover:text-ink">
        ← Explore
      </Link>

      <header className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-5">
          <StockLogo stock={stock} size={64} />
          <div>
            <h1 className="text-[clamp(2rem,5vw,3.25rem)] font-medium leading-none tracking-[-0.04em]">{stock.name}</h1>
            <p className="mt-2 font-mono text-sm text-muted">{stock.ticker}</p>
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-[clamp(2rem,5vw,3.25rem)] font-medium leading-none tracking-[-0.04em]">{formatUsd(pick?.price)}</p>
          <p className="mt-2 text-sm text-muted">per share, on-chain</p>
        </div>
      </header>

      <section className="mt-12 grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-card border border-line bg-surface p-7">
          <h2 className="text-xl font-medium tracking-tight">Ways to own {stock.name}</h2>
          <p className="mt-1 text-muted">
            {stock.tokens.length > 1
              ? `There are ${stock.tokens.length} versions of this stock. They're backed by the same company; they differ in cost and when they trade.`
              : "There's one version of this stock on Firstshare."}
          </p>
          <ul className="mt-6 divide-y divide-line">
            {stock.tokens.map((t) => {
              const issuer = ISSUER[t.platform];
              const ours = t === pick;
              return (
                <li key={t.address} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      {issuer.name}
                      <span className="font-mono text-xs text-muted">{t.symbol}</span>
                      {ours && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent-ink">Our pick</span>}
                    </p>
                    <p className="mt-1 text-sm text-muted">{issuer.note}</p>
                  </div>
                  <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-1.5">
                    <p className="font-medium">{formatUsd(t.price)}</p>
                    <StatePill state={tokenState(t)} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-card border border-line bg-surface p-7">
            <p className="text-sm text-muted">With $1 you&apos;d own about</p>
            <p className="mt-2 text-3xl font-medium tracking-tight">{formatShares(oneDollar)}</p>
            <p className="text-sm text-muted">of one share</p>
            <p className="mt-6 text-sm text-muted">
              You don&apos;t need to buy a whole share. You own exactly the slice you pay for, and it moves with the real price.
            </p>
          </div>
          <div className="rounded-card border border-dashed border-line p-7 text-sm text-muted">
            Buying straight from this page arrives next: pick an amount, see our price check, confirm in your wallet.
          </div>
        </aside>
      </section>
    </div>
  );
}
