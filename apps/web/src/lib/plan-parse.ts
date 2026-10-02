import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { PlanError, WEEKDAYS, describeRule, validatePlan, type Plan, type Stock } from "@firstshare/core";
import { z } from "zod";
import { displayName, nameInSentence } from "./stock";

const Schedule = z.discriminatedUnion("every", [
  z.object({ every: z.literal("day") }),
  z.object({ every: z.literal("week"), on: z.enum(WEEKDAYS) }),
  z.object({ every: z.literal("month"), on: z.number().int() }),
]);

// The ticker enum is the live catalog, so structured output can't name a stock Firstshare doesn't have.
// Range checks live in validatePlan so the model's output and hand-edited cards go through the same rules.
function schema(tickers: [string, ...string[]]) {
  const ticker = z.enum(tickers);
  const Rule = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("buy_schedule"), ticker, amountUsd: z.number(), schedule: Schedule }),
    z.object({ kind: z.literal("buy_dip"), ticker, amountUsd: z.number(), dropPct: z.number(), lookbackDays: z.number().int() }),
    z.object({ kind: z.literal("buy_below"), ticker, amountUsd: z.number(), priceUsd: z.number() }),
    z.object({ kind: z.literal("take_profit"), ticker, gainPct: z.number(), sellPct: z.number() }),
  ]);
  return z.object({
    name: z.string().describe("Short plan name, 2-5 words"),
    rules: z.array(Rule),
    monthlyCapUsd: z.number().nullable(),
    assumptions: z.array(z.string()).describe("Each default you filled in, as a short sentence the user can check"),
    unsupported: z.array(z.string()).describe("Parts of the request no rule can express, quoted or paraphrased"),
  });
}

const INSTRUCTIONS = `You turn a beginner's investing plan, written in everyday English, into Firstshare plan rules.

Firstshare buys and sells tokenized US stocks with US dollars. It can only:
- buy_schedule: buy a dollar amount every day, every week on a weekday, or every month on a day from 1 to 28.
- buy_dip: buy a dollar amount when the price falls dropPct% below its highest price over the last lookbackDays days.
- buy_below: buy a dollar amount when one share costs less than priceUsd.
- take_profit: sell sellPct% of the holding when it is up gainPct% on the average price paid.
- monthlyCapUsd: one overall limit on how much the plan may spend per calendar month (null if none was asked for).
Every buy is also checked against the real New York price before it goes through; that is automatic, so never turn it into a rule.

Use only tickers from the list below; match company names, brands and common nicknames to them. Percentages are plain numbers (5 means 5%).
When the user leaves something out, pick a sensible default and record it in assumptions: "weekly" means Monday, "monthly" means the 1st, "recently" or "recent high" means 30 days, "sell" without a share means 100%.
If the user names a cryptocurrency or commodity and a fund on the list tracks it (for example a Bitcoin or gold fund), use that fund and say so in assumptions.
Anything that can't be expressed (other crypto, options, shorting, leverage, stocks not on the list, conditions on news or other assets) goes in unsupported, never into a rule. If nothing in the request can become a rule, return an empty rules list.
Write the name, assumptions and unsupported items in plain English for someone who has never invested.`;

function catalogText(stocks: Stock[]): string {
  return stocks.map((s) => `${s.ticker}: ${s.name}${displayName(s) !== s.name ? ` (${displayName(s)})` : ""}`).join("\n");
}

export interface ParsedPlan {
  plan: Plan | null;
  rules: string[];
  assumptions: string[];
  unsupported: string[];
  problems: string[];
}

export class PlanParseError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PlanParseError";
  }
}

let client: Anthropic | null = null;

export async function parsePlan(text: string, stocks: Stock[]): Promise<ParsedPlan> {
  client ??= new Anthropic();
  let response;
  try {
    response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(schema(stocks.map((s) => s.ticker) as [string, ...string[]])) },
      system: [
        { type: "text", text: INSTRUCTIONS },
        { type: "text", text: `Available stocks and funds:\n${catalogText(stocks)}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: text }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError) {
      throw new PlanParseError("The plan reader is busy. Try again in a moment.", true);
    }
    if (e instanceof Anthropic.APIError) throw new PlanParseError(`The plan reader failed (${e.status ?? "no status"}).`, false);
    throw e;
  }
  if (response.stop_reason === "refusal") throw new PlanParseError("That plan couldn't be read. Try describing it differently.", false);
  const parsed = response.parsed_output;
  if (!parsed) throw new PlanParseError("The plan came back incomplete. Try again.", true);

  const byTicker = new Map(stocks.map((s) => [s.ticker, nameInSentence(s)]));
  const plan: Plan = { version: 1, name: parsed.name, rules: parsed.rules, monthlyCapUsd: parsed.monthlyCapUsd };
  const base = { assumptions: parsed.assumptions, unsupported: parsed.unsupported };
  if (plan.rules.length === 0) return { plan: null, rules: [], problems: [], ...base };
  try {
    validatePlan(plan, new Set(byTicker.keys()));
    return { plan, rules: plan.rules.map((r) => describeRule(r, (t) => byTicker.get(t) ?? t)), problems: [], ...base };
  } catch (e) {
    if (!(e instanceof PlanError)) throw e;
    return { plan, rules: plan.rules.map((r) => describeRule(r, (t) => byTicker.get(t) ?? t)), problems: e.problems, ...base };
  }
}
