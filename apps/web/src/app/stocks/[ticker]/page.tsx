import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CheckCard } from "@/components/check-card";
import { Reveal } from "@/components/motion/reveal";
import { SliceCalculator } from "@/components/slice";
import { StatePill, StockLogo } from "@/components/stock";
import { getProfiles, getStock } from "@/lib/data";
import { formatUsd } from "@/lib/format";
import type { RwaUnderlyingProfile } from "@firstshare/core";
import { ISSUER, perShare, preferredToken, shortName, summarize, tokenState } from "@/lib/stock";

type Props = { params: Promise<{ ticker: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const stock = await getStock((await params).ticker);
  return { title: stock ? `${stock.name} · Firstshare` : "Not found · Firstshare" };
}

export default async function StockPage({ params }: Props) {
  const stock = await getStock((await params).ticker);
  if (!stock) notFound();

  const pick = preferredToken(stock);
  const profiles = await getProfiles(stock);
  const company = [...profiles.values()].find((p) => p.companyInfo?.description)?.companyInfo ?? null;

  return (
    <div className="pt-8">
      <Link href="/stocks" className="group inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-ink">
        <span className="transition group-hover:-translate-x-1">←</span> Explore
      </Link>

      <Reveal y={20} className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-5">
          <StockLogo stock={stock} size={68} />
          <div>
            <h1 className="text-headline font-medium">{stock.name}</h1>
            <p className="mt-2 font-mono text-sm text-muted">{stock.ticker}</p>
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-headline font-medium">{formatUsd(perShare(pick))}</p>
          <p className="mt-2 text-sm text-muted">per share, on-chain</p>
        </div>
      </Reveal>

      <section className="mt-8 grid items-start gap-3 sm:mt-12 sm:gap-4 lg:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-4">
          {company?.description && (
            <Reveal delay={0.05} className="rounded-card border border-line bg-surface p-5 sm:p-7">
              <h2 className="text-xl font-medium tracking-tight">What {shortName(stock.name)} does</h2>
              <p className="mt-3 leading-relaxed text-muted">{company.description}</p>
              <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-6 text-sm sm:grid-cols-3">
                {company.industry && <Fact label="Industry" value={company.industry} />}
                {company.ceo && <Fact label="CEO" value={company.ceo} />}
                {company.website && (
                  <Fact
                    label="Website"
                    value={
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-line underline-offset-4 transition hover:decoration-ink"
                      >
                        {company.website.replace(/^https?:\/\/(www\.)?/, "")}
                      </a>
                    }
                  />
                )}
              </dl>
            </Reveal>
          )}
          <Reveal delay={0.1} className="rounded-card border border-line bg-surface p-5 sm:p-7">
            <h2 className="text-xl font-medium tracking-tight">Ways to own {stock.name}</h2>
            <p className="mt-1 text-muted">
              {stock.tokens.length > 1
                ? `There are ${stock.tokens.length} versions of this stock. Same company; they differ in cost and in when they trade.`
                : "There's one version of this stock on Firstshare."}
            </p>
            <ul className="mt-6 divide-y divide-line">
              {stock.tokens.map((t) => {
                const issuer = ISSUER[t.platform];
                return (
                  <li key={t.address} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="flex items-center gap-2 font-medium">
                        {issuer.name}
                        <span className="font-mono text-xs text-muted">{t.symbol}</span>
                        {t === pick && (
                          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent-ink">Our pick</span>
                        )}
                      </p>
                      <p className="mt-1 text-sm text-muted">{issuer.note}</p>
                      <Proof profile={profiles.get(t.address)} />
                    </div>
                    <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-1.5">
                      <p className="font-medium">{formatUsd(perShare(t))}</p>
                      <StatePill state={tokenState(t)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={0.2} className="flex flex-col gap-4 lg:sticky lg:top-24">
          <CheckCard ticker={stock.ticker} name={stock.name} />
          <div className="rounded-card border border-line bg-surface p-5 sm:p-7">
            <p className="mb-6 text-sm text-muted">What a slice looks like</p>
            <SliceCalculator stocks={[summarize(stock)]} compact />
          </div>
        </Reveal>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function Proof({ profile }: { profile: RwaUnderlyingProfile | undefined }) {
  const p = profile?.protections;
  const links = [
    p?.dailyAttestationReport?.url && { href: p.dailyAttestationReport.url, label: "Daily backing report" },
    p?.monthlyAttestationReport?.url && { href: p.monthlyAttestationReport.url, label: "Monthly backing report" },
    p?.collateralReport?.url && { href: p.collateralReport.url, label: "Collateral report" },
  ].filter((l): l is { href: string; label: string } => Boolean(l));

  if (links.length) {
    return (
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noreferrer"
            className="text-ink underline decoration-line underline-offset-4 transition hover:decoration-ink"
          >
            {l.label} ↗
          </a>
        ))}
      </p>
    );
  }
  if (p?.collateralReport?.supported) {
    return <p className="mt-2 text-sm text-muted">Backing is reported by Binance. A public report link isn&apos;t available yet.</p>;
  }
  return null;
}
