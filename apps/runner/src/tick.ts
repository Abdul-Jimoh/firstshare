import { randomUUID } from "node:crypto";
import {
  THRESHOLDS,
  USDT_BSC,
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
  type PlanEvent,
  type PriceHistory,
  type SavedPlan,
  type Stock,
  type W3Client,
} from "@firstshare/core";
import { agenticWalletAddress } from "./agentic-wallet.ts";
import { CHECKER, buyCheck, resumeCheck } from "./checker.ts";
import { agenticQuote, agenticSwap } from "./execute.ts";
import { rememberJob, settleDueJobs } from "./settle.ts";

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
export async function tick(deps: TickDeps): Promise<void> {
  const plans = await activePlans(deps.kv);
  if (plans.length) await tickPlans(plans, deps);
  if (await agenticWalletAddress().catch(() => null)) await settleDueJobs(deps.kv, deps.log ?? (() => {})).catch((e) => deps.log?.(`settle pass failed: ${e}`));
}

// Runs the given plans once and saves them back; tick() feeds it every active plan.
export async function tickPlans(plans: SavedPlan[], { kv, client, now = new Date(), log = () => {} }: TickDeps): Promise<void> {
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

  const agentic = plans.some((p) => p.mode === "auto") ? ((await agenticWalletAddress().catch(() => null))?.toLowerCase() ?? null) : null;
  for (const saved of plans) {
    try {
      await runPlan(saved, { agentic, kv, client, byTicker, day, check, log });
      await savePlan(kv, saved);
    } catch (e) {
      log(`plan ${saved.id} failed: ${(e as Error).stack ?? e}`);
    }
  }
}

interface PlanCtx {
  agentic: string | null;
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

  saved.waiting ??= {};
  saved.pending ??= {};
  saved.executor ??= null;
  saved.heldToken ??= {};
  saved.checkJobs ??= {};

  for (let index = 0; index < plan.rules.length; index++) {
    const open = saved.pending[index];
    if (open && open.day !== ctx.day && plan.rules[index]!.kind === "buy_schedule") {
      delete saved.pending[index];
      commitSkip(plan, state, { rule: index, ticker: open.ticker, side: "buy", usd: open.usd }, open.day);
      await addEvent(ctx.kv, saved.id, { t: Date.now(), kind: "skipped", rule: index, ticker: open.ticker, usd: open.usd, text: "Skipped: it wasn't approved the same day." });
    }
    const intent = evaluateRule(plan, index, state, market);
    if (!intent) {
      delete saved.waiting[index];
      continue;
    }
    if (saved.pending[index]) continue;
    const stock = ctx.byTicker.get(intent.ticker)!;
    const rule = describeRule(plan.rules[index]!, name);
    const step: Step = { saved, ctx, intent, stock, rule };
    if (intent.side === "sell") {
      if (saved.mode === "paper") await paperSell(step, prices.get(intent.ticker)!);
      else if (saved.mode === "ask") await askApproval(step, null, `Time to sell: you're up enough on ${name(intent.ticker)}. (${rule})`);
      else await autoSell(step);
      continue;
    }
    if (!capAllows(plan, state, intent.usd, ctx.day)) {
      commitSkip(plan, state, intent, ctx.day);
      await addEvent(ctx.kv, saved.id, { t: Date.now(), kind: "skipped", rule: index, ticker: intent.ticker, usd: intent.usd, text: `Skipped: it would go over the monthly limit. (${rule})` });
      continue;
    }
    // The free in-process check runs first in every mode; the paid Checker is only bought once it says yes.
    const c = await ctx.check(stock, intent.usd);
    if (!c || !BUYABLE.has(c.verdict) || !c.shares || perShare(c) === undefined) {
      await waitFor(step, c ? `${c.verdict}: ${c.headline}` : "price check failed", {
        fairPrice: c?.fair?.perShare ?? null,
        verdict: c?.verdict ?? "unavailable",
        text: `Waiting for a fair price. ${c?.headline ?? "The price couldn't be checked."}`,
      });
      continue;
    }
    delete saved.waiting[index];
    if (saved.mode === "paper") await paperBuy(step, c);
    else if (saved.mode === "ask") await askApproval(step, c.pick?.token.address ?? null, `Ready to buy: ${c.headline} Approve it to buy from your wallet.`);
    else await autoBuy(step);
  }
}

interface Step {
  saved: SavedPlan;
  ctx: PlanCtx;
  intent: Intent;
  stock: Stock;
  rule: string;
}

async function waitFor({ saved, ctx, intent }: Step, reason: string, extra: Partial<PlanEvent> & { text: string }) {
  if (saved.waiting[intent.rule] === reason) return;
  saved.waiting[intent.rule] = reason;
  await addEvent(ctx.kv, saved.id, { t: Date.now(), kind: "waiting", rule: intent.rule, ticker: intent.ticker, ...(intent.side === "buy" ? { usd: intent.usd } : {}), ...extra });
  ctx.log(`${saved.id} rule ${intent.rule} waiting: ${reason}`);
}

async function paperBuy({ saved, ctx, intent }: Step, c: Check) {
  if (intent.side !== "buy") return;
  commitFill(saved.plan, saved.state, intent, { shares: c.shares!, usd: intent.usd }, ctx.day);
  await addEvent(ctx.kv, saved.id, {
    t: Date.now(),
    kind: "bought",
    rule: intent.rule,
    ticker: intent.ticker,
    usd: intent.usd,
    shares: c.shares!,
    price: perShare(c)!,
    fairPrice: c.fair?.perShare ?? null,
    verdict: c.verdict,
    text: `Practice buy: ${c.headline}`,
  });
  ctx.log(`${saved.id} rule ${intent.rule} paper buy $${intent.usd} ${intent.ticker} @ ${perShare(c)!.toFixed(2)}`);
}

async function paperSell({ saved, ctx, intent, rule }: Step, price: number) {
  if (intent.side !== "sell") return;
  const shares = holding(saved.state, intent.ticker).shares * intent.fraction;
  const usd = shares * price * (1 - SELL_COST);
  commitFill(saved.plan, saved.state, intent, { shares, usd }, ctx.day);
  await addEvent(ctx.kv, saved.id, { t: Date.now(), kind: "sold", rule: intent.rule, ticker: intent.ticker, usd, shares, price, text: `Practice sell. (${rule})` });
}

async function askApproval({ saved, ctx, intent }: Step, token: string | null, text: string) {
  saved.pending[intent.rule] = {
    id: randomUUID(),
    rule: intent.rule,
    ticker: intent.ticker,
    side: intent.side,
    usd: intent.side === "buy" ? intent.usd : 0,
    ...(intent.side === "sell" ? { fraction: intent.fraction } : {}),
    token,
    day: ctx.day,
    createdAt: Date.now(),
    headline: text,
  };
  await addEvent(ctx.kv, saved.id, { t: Date.now(), kind: "pending", rule: intent.rule, ticker: intent.ticker, ...(intent.side === "buy" ? { usd: intent.usd } : {}), text });
  ctx.log(`${saved.id} rule ${intent.rule} pending approval`);
}

// Real money. The Checker job is recorded the moment it exists, so a failure later in the run is retried against
// the same paid job instead of paying again; after a few failed retries the firing is used up.
const MAX_ATTEMPTS = 3;
async function autoBuy(step: Step) {
  const { saved, ctx, intent, stock } = step;
  if (intent.side !== "buy") return;
  if (!ctx.agentic || saved.executor !== ctx.agentic) {
    await waitFor(step, "no agentic wallet", { kind: "error", text: "Can't buy: the Agentic Wallet for this plan isn't signed in on the runner." });
    return;
  }
  const open = saved.checkJobs[intent.rule]?.day === ctx.day ? saved.checkJobs[intent.rule] : undefined;
  try {
    const paid = open
      ? await resumeCheck(open.jobId, ctx.log)
      : await buyCheck({ ticker: intent.ticker, amountUsd: intent.usd }, ctx.log, async (jobId) => {
          saved.checkJobs[intent.rule] = { jobId, day: ctx.day, attempts: 0 };
          await savePlan(ctx.kv, saved);
          await rememberJob(ctx.kv, jobId);
        });
    const r = paid.result as { verdict?: string; headline?: string; pick?: { token: string; perShare: number } | null; fairPricePerShare?: { usd: number } | null };
    if (!r.verdict || !BUYABLE.has(r.verdict) || !r.pick) {
      delete saved.checkJobs[intent.rule];
      commitSkip(saved.plan, saved.state, intent, ctx.day);
      await addEvent(ctx.kv, saved.id, { t: Date.now(), kind: "skipped", rule: intent.rule, ticker: intent.ticker, usd: intent.usd, verdict: r.verdict ?? "unavailable", checkJob: paid.jobId, text: `Skipped: the Checker said ${r.headline ?? "the price couldn't be confirmed."}` });
      return;
    }
    const token = stock.tokens.find((t) => t.address.toLowerCase() === r.pick!.token.toLowerCase());
    if (!token) throw new Error(`Checker picked an unknown token ${r.pick.token}`);
    const quoted = await agenticQuote(USDT_BSC, token.address, intent.usd);
    const quotedPerShare = intent.usd / (quoted * token.sharesPerToken);
    const fair = r.fairPricePerShare?.usd ?? null;
    if (fair && quotedPerShare > fair * (1 + THRESHOLDS.fair)) {
      delete saved.checkJobs[intent.rule];
      commitSkip(saved.plan, saved.state, intent, ctx.day);
      await addEvent(ctx.kv, saved.id, { t: Date.now(), kind: "skipped", rule: intent.rule, ticker: intent.ticker, usd: intent.usd, fairPrice: fair, checkJob: paid.jobId, text: `Skipped: the wallet's own quote ($${quotedPerShare.toFixed(2)} a share) was above New York's $${fair.toFixed(2)}.` });
      return;
    }
    const fill = await agenticSwap(USDT_BSC, token.address, intent.usd, ctx.log);
    const tokens = Number.isFinite(fill.received) && fill.received > 0 ? fill.received : quoted;
    const shares = tokens * token.sharesPerToken;
    commitFill(saved.plan, saved.state, intent, { shares, usd: intent.usd }, ctx.day);
    saved.heldToken[intent.ticker] = token.address;
    delete saved.checkJobs[intent.rule];
    await addEvent(ctx.kv, saved.id, {
      t: Date.now(),
      kind: "bought",
      rule: intent.rule,
      ticker: intent.ticker,
      usd: intent.usd,
      shares,
      price: intent.usd / shares,
      fairPrice: fair,
      verdict: r.verdict,
      checkJob: paid.jobId,
      ...(fill.txHash ? { tx: fill.txHash } : {}),
      text: `Bought ${token.symbol} through the Agentic Wallet after the Firstshare Checker (agent #${CHECKER.agentId}) confirmed ${r.headline}`,
    });
    ctx.log(`${saved.id} rule ${intent.rule} REAL buy $${intent.usd} ${token.symbol} order ${fill.orderId} tx ${fill.txHash}`);
  } catch (e) {
    const job = saved.checkJobs[intent.rule];
    const retry = job && job.day === ctx.day && ++job.attempts < MAX_ATTEMPTS;
    if (!retry) {
      delete saved.checkJobs[intent.rule];
      commitSkip(saved.plan, saved.state, intent, ctx.day);
    }
    await addEvent(ctx.kv, saved.id, {
      t: Date.now(),
      kind: "error",
      rule: intent.rule,
      ticker: intent.ticker,
      usd: intent.usd,
      text: `${retry ? "Retrying shortly with the same paid check" : "Couldn't buy"}: ${(e as Error).message.slice(0, 200)}`,
    });
    ctx.log(`${saved.id} rule ${intent.rule} auto buy failed: ${(e as Error).stack ?? e}`);
  }
}

async function autoSell(step: Step) {
  const { saved, ctx, intent, stock, rule } = step;
  if (intent.side !== "sell") return;
  const token = stock.tokens.find((t) => t.address.toLowerCase() === saved.heldToken[intent.ticker]?.toLowerCase());
  if (!ctx.agentic || saved.executor !== ctx.agentic || !token) {
    await waitFor(step, "can't sell", { kind: "error", text: "Can't sell: the Agentic Wallet isn't signed in on the runner, or it doesn't hold this stock." });
    return;
  }
  try {
    const shares = holding(saved.state, intent.ticker).shares * intent.fraction;
    const fill = await agenticSwap(token.address, USDT_BSC, shares / token.sharesPerToken, ctx.log);
    const usd = Number.isFinite(fill.received) ? fill.received : 0;
    commitFill(saved.plan, saved.state, intent, { shares, usd }, ctx.day);
    await addEvent(ctx.kv, saved.id, { t: Date.now(), kind: "sold", rule: intent.rule, ticker: intent.ticker, usd, shares, ...(fill.txHash ? { tx: fill.txHash } : {}), text: `Sold through the Agentic Wallet. (${rule})` });
  } catch (e) {
    commitSkip(saved.plan, saved.state, intent, ctx.day);
    await addEvent(ctx.kv, saved.id, { t: Date.now(), kind: "error", rule: intent.rule, ticker: intent.ticker, text: `Couldn't sell: ${(e as Error).message.slice(0, 200)}` });
  }
}
