import { describe, expect, it } from "vitest";
import { W3Error } from "../src/binance/client.ts";
import { assess, fromQuote, fromQuoteError, type FairPrice, type Option } from "../src/check.ts";
import type { StockToken } from "../src/catalog.ts";
import type { QuoteRoute } from "../src/binance/types.ts";

const MONDAY_OPEN = new Date("2026-09-28T14:02:00Z");
const SATURDAY = new Date("2026-09-26T09:31:00Z");
const stock = { ticker: "SPY", name: "SPDR S&P 500 ETF Trust" };

function token(platform: "bstock" | "ondo", p: Partial<StockToken> = {}): StockToken {
  return {
    platform,
    symbol: platform === "bstock" ? "SPYB" : "SPYon",
    address: `0x${platform}`,
    decimals: 18,
    sharesPerToken: 1,
    logoUrl: null,
    status: { openState: true, marketStatus: null, reasonCode: "TRADING", reasonMsg: null, nextOpenTime: null, nextCloseTime: null },
    price: null,
    source: "api",
    ...p,
  };
}

function option(t: StockToken, perShare: number | null, extra: Partial<Option> = {}): Option {
  return {
    token: t,
    paused: null,
    quote:
      perShare === null
        ? { ok: false, reason: "No one is offering this version right now.", code: null }
        : { ok: true, tokensOut: 100 / perShare, perShare, priceImpact: 0, mode: "SWAP", vendor: "LiquidMesh" },
    premium: null,
    ...extra,
  };
}

const fair = (perShare: number, source: FairPrice["source"] = "live"): FairPrice => ({ perShare, source, at: 0 });

describe("assess", () => {
  it("picks the cheaper version and calls a price below New York good", () => {
    const c = assess({
      stock,
      amountUsd: 100,
      options: [option(token("bstock"), 768.6), option(token("ondo"), 775.42)],
      fair: fair(770),
      now: MONDAY_OPEN,
    });
    expect(c.pick?.token.platform).toBe("bstock");
    expect(c.verdict).toBe("good");
    expect(c.headline).toMatch(/^You'd pay \$768\.60 a share, 0\.2% below New York's \$770\.00\./);
    expect(c.notes.join(" ")).toMatch(/other version would cost 0\.9% more/);
  });

  it("says the same price instead of 0.00% when the gap rounds away", () => {
    const c = assess({ stock, amountUsd: 10, options: [option(token("bstock"), 231.2401)], fair: fair(231.2417), now: MONDAY_OPEN });
    expect(c.headline).toBe("You'd pay $231.24 a share, the same as New York's $231.24.");
  });

  it("warns off the weekend SPYon trap and says why", () => {
    const c = assess({
      stock,
      amountUsd: 100,
      options: [option(token("ondo"), 859.93)],
      fair: { perShare: 785.53, source: "recorded", at: Date.parse("2026-09-25T21:05:00Z") },
      now: SATURDAY,
    });
    expect(c.verdict).toBe("avoid");
    expect(c.headline).toMatch(/9\.5% above New York's \$785\.53\. We'd wait\./);
    expect(c.notes[0]).toMatch(/New York is closed\. We compare with its last price \(Fri 5:05 PM ET\)/);
  });

  it("keeps bStocks unless another version is meaningfully cheaper", () => {
    const near = assess({
      stock,
      amountUsd: 100,
      options: [option(token("bstock"), 230.92), option(token("ondo"), 230.85)],
      fair: fair(231.68),
      now: MONDAY_OPEN,
    });
    expect(near.pick?.token.platform).toBe("bstock");
    const far = assess({
      stock,
      amountUsd: 100,
      options: [option(token("bstock"), 60.05), option(token("ondo"), 59.66)],
      fair: fair(59.73),
      now: MONDAY_OPEN,
    });
    expect(far.pick?.token.platform).toBe("ondo");
  });

  it("grades the bands in between", () => {
    const grade = (p: number) =>
      assess({ stock, amountUsd: 20, options: [option(token("bstock"), p)], fair: fair(100), now: MONDAY_OPEN }).verdict;
    expect(grade(100.4)).toBe("good");
    expect(grade(101)).toBe("fair");
    expect(grade(103)).toBe("pricey");
    expect(grade(105)).toBe("avoid");
  });

  it("refuses to vouch for a price it can't compare", () => {
    const c = assess({ stock, amountUsd: 5, options: [option(token("bstock"), 768)], fair: null, now: MONDAY_OPEN });
    expect(c.verdict).toBe("unverified");
    expect(c.pick).not.toBeNull();
  });

  it("skips a paused version and reports when everything is paused", () => {
    const paused = option(token("bstock"), 768, { paused: "a dividend payout" });
    const both = assess({ stock, amountUsd: 50, options: [paused, option(token("ondo"), 770)], fair: fair(770), now: MONDAY_OPEN });
    expect(both.pick?.token.platform).toBe("ondo");
    const only = assess({ stock, amountUsd: 50, options: [paused], fair: fair(770), now: MONDAY_OPEN });
    expect(only.verdict).toBe("paused");
    expect(only.headline).toMatch(/paused for a dividend payout/);
  });

  it("explains why nothing can be bought", () => {
    const tooSmall = option(token("ondo"), null, {
      quote: { ok: false, reason: "This version needs a bigger order, usually $20 or more.", code: 40375 },
    });
    const c = assess({ stock, amountUsd: 5, options: [tooSmall], fair: fair(770), now: MONDAY_OPEN });
    expect(c.verdict).toBe("unavailable");
    expect(c.headline).toMatch(/can't buy \$5\.00 .* bigger order/);
  });

  it("counts shares through the token-to-share ratio", () => {
    const t = token("ondo", { sharesPerToken: 1.0095 });
    const c = assess({
      stock,
      amountUsd: 100,
      options: [
        {
          ...option(t, 0),
          quote: { ok: true, tokensOut: 0.128, perShare: 100 / (0.128 * 1.0095), priceImpact: 0, mode: "SWAP", vendor: "x" },
        },
      ],
      fair: null,
      now: MONDAY_OPEN,
    });
    expect(c.shares).toBeCloseTo(0.128 * 1.0095, 6);
  });
});

describe("quote parsing", () => {
  const route = (toTokenAmount: string): QuoteRoute =>
    ({ toTokenAmount, priceImpactPercent: "0.0930489919", executionMode: "SWAP", vendorName: "LiquidMesh" }) as QuoteRoute;

  it("turns a raw quote into a per-share price", () => {
    const q = fromQuote(route("116289134186101420"), 100, token("ondo", { sharesPerToken: 1.0095 }));
    expect(q.ok && q.perShare).toBeCloseTo(100 / (0.11628913418610142 * 1.0095), 4);
    expect(q.ok && q.priceImpact).toBeCloseTo(0.093, 3);
  });

  it("maps API errors to plain English", () => {
    expect(fromQuoteError(new W3Error(40375, "Minimum order amount is 5 USD.", "/q", 200))).toMatchObject({
      ok: false,
      code: 40375,
      reason: expect.stringMatching(/bigger order/),
    });
    expect(fromQuoteError(new W3Error(40369, "BSTOCK_INVALID_TRADING_TIME", "/q", 200))).toMatchObject({
      reason: "Not tradable until New York opens.",
    });
    expect(fromQuoteError(new Error("boom"))).toMatchObject({ ok: false, code: null });
  });
});
