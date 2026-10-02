import {
  addEvent,
  activePlans,
  capAllows,
  commitFill,
  commitSkip,
  describeRule,
  evaluateRule,
  holding,
  lastNyPrice,
  nameInSentence,
  loadCatalog,
  planTickers,
  priceHistory,
  recordNyPrice,
  runCheck,
  savePlan,
  type Check,
  type Intent,
  type KV,
  type Market,
  type PriceHistory,
  type SavedPlan,
  type Stock,
  type W3Client,
} from "@firstshare/core";

const PRICE_PROBE_USD = 10;
// Paper sells are filled at the quoted price minus roughly the issuer's cost, as the backtest does.
const SELL_COST = 0.001;
const BUYABLE = new Set(["good", "fair"]);

const CATALOG_TTL_MS = 10 * 60_000;
const HISTORY_TTL_MS = 60 * 60_000;
let catalog: { at: number; stocks: Stock[] } | null = null;
const histories = new Map<string, { at: number; value: PriceHistory | null }>();

async function getCatalog(client: W3Client): Promise<Stock[]> {
  if (!catalog || Date.now() - catalog.at > CATALOG_TTL_MS) catalog = { at: Date.now(), stocks: await loadCatalog(client) };
  return catalog.stocks;
}

async function history(client: W3Client, stock: Stock): Promise<PriceHistory | null> {
  const hit = histories.get(stock.ticker);
  if (hit && Date.now() - hit.at < HISTORY_TTL_MS) return hit.value;
  const value = await priceHistory(client, stock).catch(() => null);
  histories.set(stock.ticker, { at: Date.now(), value });
  return value;
}

export interface TickDeps {
  kv: KV;
  client: W3Client;
  now?: Date;
  log?: (line: string) => void;
}

// One pass over every active plan. A fresh check per ticker supplies the price the rules see, so a plan reacts
// to what a buyer would actually pay on-chain, the same series the backtest replays.
export async function tick({ kv, client, now = new Date(), log = () => {} }: TickDeps): Promise<void> {
  const plans = await activePlans(kv);
  if (!plans.length) return;
  const stocks = await getCatalog(client);
  const byTicker = new Map(stocks.map((s) => [s.ticker, s]));
  const day = now.toISOString().slice(0, 10);
  const checks = new Map<string, Promise<Check | null>>();
  const check = (stock: Stock, usd: number) => {
    const key = `${stock.ticker}:${usd}`;
    if (!checks.has(key)) {
      checks.set(
        key,
        runCheck(client, stock, usd, { recordedFair: () => lastNyPrice(kv, stock.ticker), now })
          .then(async (c) => {
            if (c.fair?.source === "live") await recordNyPrice(kv, stock.ticker, c.fair).catch(() => {});
            return c;
          })
          .catch((e) => {
            log(`check ${stock.ticker} $${usd} failed: ${(e as Error).message}`);
            return null;
          }),
      );
    }
    return checks.get(key)!;
  };

  for (const saved of plans) {
    try {
      await runPlan(saved, { kv, client, byTicker, day, check, log });
      await savePlan(kv, saved);
    } catch (e) {
      log(`plan ${saved.id} failed: ${(e as Error).stack ?? e}`);
    }
  }
}

interface PlanCtx {
  kv: KV;
  client: W3Client;
  byTicker: Map<string, Stock>;
  day: string;
  check: (stock: Stock, usd: number) => Promise<Check | null>;
  log: (line: string) => void;
}

const perShare = (c: Check | null) => (c?.pick?.quote.ok ? c.pick.quote.perShare : undefined);

async function runPlan(saved: SavedPlan, ctx: PlanCtx): Promise<void> {
  const { plan, state } = saved;
  const prices = new Map<string, number>();
  const closes = new Map<string, number[]>();
  for (const ticker of planTickers(plan)) {
    const stock = ctx.byTicker.get(ticker);
    if (!stock) continue;
    const price = perShare(await ctx.check(stock, PRICE_PROBE_USD));
    if (price === undefined) continue;
    prices.set(ticker, price);
    const past = (await history(ctx.client, stock))?.points.filter((p) => new Date(p.t).toISOString().slice(0, 10) < ctx.day).map((p) => p.close) ?? [];
    closes.set(ticker, [...past, price]);
  }
  const market: Market = {
    day: ctx.day,
    price: (t) => prices.get(t),
    highOver: (t, days) => {
      const w = closes.get(t)?.slice(-days);
      return w?.length ? Math.max(...w) : undefined;
    },
  };
  const name = (t: string) => {
    const s = ctx.byTicker.get(t);
    return s ? nameInSentence(s) : t;
  };
  const event = (e: Parameters<typeof addEvent>[2]) => addEvent(ctx.kv, saved.id, e);

  for (let index = 0; index < plan.rules.length; index++) {
    const intent = evaluateRule(plan, index, state, market);
    if (!intent) {
      delete saved.waiting[index];
      continue;
    }
    const stock = ctx.byTicker.get(intent.ticker)!;
    const rule = describeRule(plan.rules[index]!, name);
    if (intent.side === "sell") {
      await paperSell(saved, intent, prices.get(intent.ticker)!, rule, event, ctx.day);
      continue;
    }
    if (!capAllows(plan, state, intent.usd, ctx.day)) {
      commitSkip(plan, state, intent, ctx.day);
      await event({ t: Date.now(), kind: "skipped", rule: index, ticker: intent.ticker, usd: intent.usd, text: `Skipped: it would go over the monthly limit. (${rule})` });
      continue;
    }
    const c = await ctx.check(stock, intent.usd);
    if (!c || !BUYABLE.has(c.verdict) || !c.shares || perShare(c) === undefined) {
      const reason = c ? `${c.verdict}: ${c.headline}` : "price check failed";
      if (saved.waiting[index] !== reason) {
        saved.waiting[index] = reason;
        await event({
          t: Date.now(),
          kind: "waiting",
          rule: index,
          ticker: intent.ticker,
          usd: intent.usd,
          fairPrice: c?.fair?.perShare ?? null,
          verdict: c?.verdict ?? "unavailable",
          text: `Waiting for a fair price. ${c?.headline ?? "The price couldn't be checked."}`,
        });
        ctx.log(`${saved.id} rule ${index} waiting: ${reason}`);
      }
      continue;
    }
    delete saved.waiting[index];
    commitFill(plan, state, intent, { shares: c.shares, usd: intent.usd }, ctx.day);
    await event({
      t: Date.now(),
      kind: "bought",
      rule: index,
      ticker: intent.ticker,
      usd: intent.usd,
      shares: c.shares,
      price: perShare(c)!,
      fairPrice: c.fair?.perShare ?? null,
      verdict: c.verdict,
      text: `Practice buy: ${c.headline}`,
    });
    ctx.log(`${saved.id} rule ${index} paper buy $${intent.usd} ${intent.ticker} @ ${perShare(c)!.toFixed(2)}`);
  }
}

async function paperSell(
  saved: SavedPlan,
  intent: Extract<Intent, { side: "sell" }>,
  price: number,
  rule: string,
  event: (e: Parameters<typeof addEvent>[2]) => Promise<void>,
  day: string,
) {
  const shares = holding(saved.state, intent.ticker).shares * intent.fraction;
  const usd = shares * price * (1 - SELL_COST);
  commitFill(saved.plan, saved.state, intent, { shares, usd }, day);
  await event({ t: Date.now(), kind: "sold", rule: intent.rule, ticker: intent.ticker, usd, shares, price, text: `Practice sell. (${rule})` });
}
