import { generateText, type LanguageModel } from "ai";
import { clientFromEnv, loadCatalog, runCheck, type Check, type FairPrice, type Stock } from "./core/index.ts";

export interface CheckRequest {
  ticker: string;
  amountUsd: number;
}

const DEFAULT_AMOUNT_USD = 10;
const MAX_AMOUNT_USD = 100_000;

function fromObject(value: unknown, depth = 0): CheckRequest | null {
  if (depth > 4 || value === null) return null;
  if (typeof value === "string") return parseRequest(value, depth + 1);
  if (typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const ticker = o.ticker ?? o.symbol;
  if (typeof ticker === "string" && ticker.trim()) {
    const amount = Number(o.amountUsd ?? o.amount_usd ?? o.amount ?? DEFAULT_AMOUNT_USD);
    return { ticker: ticker.trim().toUpperCase(), amountUsd: amount };
  }
  for (const v of Object.values(o)) {
    const found = fromObject(v, depth + 1);
    if (found) return found;
  }
  return null;
}

// Accepts {"ticker":"NVDA","amountUsd":50}, an ERC-8183 job context wrapping that JSON, or plain text like "NVDA 50".
export function parseRequest(prompt: string, depth = 0): CheckRequest | null {
  const start = prompt.indexOf("{");
  const end = prompt.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const found = fromObject(JSON.parse(prompt.slice(start, end + 1)), depth);
      if (found) return found;
    } catch {}
  }
  const ticker = prompt.match(/\b[A-Z]{1,6}\b/)?.[0];
  if (!ticker) return null;
  const amount = prompt.match(/\$?\s*(\d+(?:\.\d+)?)/)?.[1];
  return { ticker, amountUsd: amount ? Number(amount) : DEFAULT_AMOUNT_USD };
}

const CATALOG_TTL_MS = 5 * 60_000;
let catalog: { at: number; stocks: Promise<Stock[]> } | null = null;

function getCatalog(): Promise<Stock[]> {
  if (!catalog || Date.now() - catalog.at > CATALOG_TTL_MS) {
    const stocks = loadCatalog(clientFromEnv());
    catalog = { at: Date.now(), stocks };
    stocks.catch(() => {
      if (catalog?.stocks === stocks) catalog = null;
    });
  }
  return catalog.stocks;
}

// Same Upstash key the web app records New York prices under, so both fall back to the same number.
async function lastNyPrice(ticker: string): Promise<FairPrice | null> {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const res = await fetch(`${url}/get/nyse:last:${ticker}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const { result } = (await res.json()) as { result: string | null };
  if (!result) return null;
  const stored = JSON.parse(result) as { perShare: number; at: number };
  return stored.perShare > 0 ? { perShare: stored.perShare, at: stored.at, source: "recorded" } : null;
}

function summary(c: Check) {
  return {
    ticker: c.ticker,
    name: c.name,
    amountUsd: c.amountUsd,
    verdict: c.verdict,
    headline: c.headline,
    notes: c.notes,
    session: c.session,
    shares: c.shares,
    fairPricePerShare: c.fair && { usd: c.fair.perShare, source: c.fair.source, at: new Date(c.fair.at).toISOString() },
    pick: c.pick?.quote.ok ? { issuer: c.pick.token.platform, symbol: c.pick.token.symbol, token: c.pick.token.address, perShare: c.pick.quote.perShare } : null,
    options: c.options.map((o) => ({
      issuer: o.token.platform,
      symbol: o.token.symbol,
      token: o.token.address,
      perShare: o.quote.ok ? o.quote.perShare : null,
      premium: o.premium,
      problem: o.paused ? `paused for ${o.paused}` : o.quote.ok ? null : o.quote.reason,
    })),
    checkedAt: new Date(c.at).toISOString(),
  };
}

const EXPLAIN_TIMEOUT_MS = 30_000;

// Pieverse's free model is a reasoning model and returns its thinking inline before the answer.
function answerOnly(text: string): string {
  const end = text.lastIndexOf("</think>");
  return (end === -1 ? text : text.slice(end + "</think>".length)).trim();
}

async function explain(model: LanguageModel, facts: ReturnType<typeof summary>, abortSignal?: AbortSignal): Promise<string | null> {
  const signal = abortSignal ? AbortSignal.any([abortSignal, AbortSignal.timeout(EXPLAIN_TIMEOUT_MS)]) : AbortSignal.timeout(EXPLAIN_TIMEOUT_MS);
  try {
    const { text } = await generateText({
      model,
      system:
        "You explain a pre-trade price check to someone buying their first stock. " +
        "Two or three short sentences, plain English, no jargon, no advice to buy or sell. " +
        "Use only the facts given. Say whether the price is close to the real New York price and why.",
      prompt: JSON.stringify(facts),
      abortSignal: signal,
    });
    return answerOnly(text) || null;
  } catch {
    return null;
  }
}

export async function checkWork(prompt: string, model: () => LanguageModel, abortSignal?: AbortSignal): Promise<string> {
  const request = parseRequest(prompt);
  if (!request) {
    return JSON.stringify({ error: 'Send a ticker and an amount, e.g. {"ticker":"NVDA","amountUsd":50}.' });
  }
  if (!(request.amountUsd >= 1 && request.amountUsd <= MAX_AMOUNT_USD)) {
    return JSON.stringify({ error: `amountUsd must be between 1 and ${MAX_AMOUNT_USD}.`, request });
  }
  const stock = (await getCatalog()).find((s) => s.ticker === request.ticker);
  if (!stock) return JSON.stringify({ error: `No tokenized stock for ${request.ticker} on BNB Smart Chain.`, request });

  const check = await runCheck(clientFromEnv(), stock, request.amountUsd, { recordedFair: () => lastNyPrice(stock.ticker) });
  const facts = summary(check);
  return JSON.stringify({ ...facts, explanation: await explain(model(), facts, abortSignal) });
}
