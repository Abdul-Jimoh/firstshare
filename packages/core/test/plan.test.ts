import { describe, expect, it } from "vitest";
import { runBacktest, type PriceHistory } from "../src/backtest.ts";
import { PlanError, describeRule, validatePlan, type Plan, type Rule } from "../src/plan.ts";

const DAY = 86_400_000;
// 2026-06-01 is a Monday.
const START = Date.UTC(2026, 5, 1);

function history(ticker: string, closes: number[]): PriceHistory {
  return { ticker, symbol: `${ticker}on`, points: closes.map((close, i) => ({ t: START + i * DAY, close })) };
}

function plan(rules: Rule[], monthlyCapUsd: number | null = null): Plan {
  return { version: 1, name: "Test", rules, monthlyCapUsd };
}

describe("validatePlan", () => {
  it("accepts a weekly buy", () => {
    const p = plan([{ kind: "buy_schedule", ticker: "AAPL", amountUsd: 10, schedule: { every: "week", on: "mon" } }]);
    expect(validatePlan(p, new Set(["AAPL"]))).toBe(p);
  });

  it("lists every problem in plain English", () => {
    const p = plan([
      { kind: "buy_schedule", ticker: "AAPL", amountUsd: 0.5, schedule: { every: "month", on: 31 } },
      { kind: "buy_dip", ticker: "ZZZZ", amountUsd: 10, dropPct: 80, lookbackDays: 30 },
    ]);
    try {
      validatePlan(p, new Set(["AAPL"]));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PlanError);
      expect((e as PlanError).problems).toEqual([
        "Rule 1: each buy has to be between $1 and $1000.",
        "Rule 1: pick a day of the month from 1 to 28.",
        "Rule 2: ZZZZ isn't available as a tokenized stock.",
        "Rule 2: the drop has to be between 1% and 50%.",
      ]);
    }
  });

  it("rejects a plan that only sells", () => {
    expect(() => validatePlan(plan([{ kind: "take_profit", ticker: "AAPL", gainPct: 20, sellPct: 50 }]))).toThrow("at least one rule that buys");
  });
});

describe("describeRule", () => {
  const name = (t: string) => ({ AAPL: "Apple", NVDA: "Nvidia" })[t] ?? t;
  it.each<[Rule, string]>([
    [{ kind: "buy_schedule", ticker: "AAPL", amountUsd: 10, schedule: { every: "week", on: "mon" } }, "Buy $10 of Apple every Monday."],
    [{ kind: "buy_schedule", ticker: "AAPL", amountUsd: 25, schedule: { every: "month", on: 1 } }, "Buy $25 of Apple on the 1st of every month."],
    [{ kind: "buy_dip", ticker: "NVDA", amountUsd: 20, dropPct: 5, lookbackDays: 30 }, "Buy $20 of Nvidia when it falls 5% below its highest price of the last 30 days."],
    [{ kind: "buy_below", ticker: "NVDA", amountUsd: 7.5, priceUsd: 200 }, "Buy $7.50 of Nvidia when a share costs less than $200."],
    [{ kind: "take_profit", ticker: "NVDA", gainPct: 20, sellPct: 50 }, "Sell 50% of my Nvidia when I'm up 20% on it."],
    [{ kind: "take_profit", ticker: "NVDA", gainPct: 20, sellPct: 100 }, "Sell all my Nvidia when I'm up 20% on it."],
  ])("%j", (rule, text) => expect(describeRule(rule, name)).toBe(text));
});

describe("runBacktest", () => {
  it("buys every Monday and values the holdings at the last close", () => {
    const r = runBacktest(plan([{ kind: "buy_schedule", ticker: "AAPL", amountUsd: 10, schedule: { every: "week", on: "mon" } }]), [history("AAPL", Array(15).fill(100))], { costPct: 0 });
    expect(r.trades.map((t) => new Date(t.t).toISOString().slice(0, 10))).toEqual(["2026-06-01", "2026-06-08", "2026-06-15"]);
    expect(r.putIn).toBe(30);
    expect(r.value).toBeCloseTo(30);
    expect(r.profit).toBeCloseTo(0);
  });

  it("buys a dip once and re-arms after the price recovers", () => {
    const closes = [100, 100, 94, 93, 92, 99, 100, 94];
    const r = runBacktest(plan([{ kind: "buy_dip", ticker: "NVDA", amountUsd: 20, dropPct: 5, lookbackDays: 5 }]), [history("NVDA", closes)], { costPct: 0 });
    expect(r.trades.map((t) => t.price)).toEqual([94, 94]);
  });

  it("buys below a price once until it climbs back over", () => {
    const closes = [210, 195, 190, 199, 205, 198];
    const r = runBacktest(plan([{ kind: "buy_below", ticker: "NVDA", amountUsd: 10, priceUsd: 200 }]), [history("NVDA", closes)], { costPct: 0 });
    expect(r.trades.map((t) => t.price)).toEqual([195, 198]);
  });

  it("takes profit on the gain against the average cost", () => {
    const closes = [100, 110, 121, 125];
    const r = runBacktest(
      plan([
        { kind: "buy_schedule", ticker: "AAPL", amountUsd: 100, schedule: { every: "month", on: 1 } },
        { kind: "take_profit", ticker: "AAPL", gainPct: 20, sellPct: 50 },
      ]),
      [history("AAPL", closes)],
      { costPct: 0 },
    );
    expect(r.trades.map((t) => [t.side, t.price])).toEqual([["buy", 100], ["sell", 121]]);
    expect(r.takenOut).toBeCloseTo(60.5);
    expect(r.value).toBeCloseTo(62.5);
    expect(r.profit).toBeCloseTo(23);
  });

  it("skips buys that would break the monthly limit", () => {
    const r = runBacktest(plan([{ kind: "buy_schedule", ticker: "AAPL", amountUsd: 10, schedule: { every: "day" } }], 25), [history("AAPL", Array(5).fill(100))], { costPct: 0 });
    expect(r.putIn).toBe(20);
    expect(r.skippedForCap).toBe(3);
  });

  it("starts when every stock in the plan has prices", () => {
    const late = { ...history("TSLA", [300, 300]), points: [300, 300].map((close, i) => ({ t: START + (3 + i) * DAY, close })) };
    const r = runBacktest(
      plan([
        { kind: "buy_schedule", ticker: "AAPL", amountUsd: 10, schedule: { every: "day" } },
        { kind: "buy_schedule", ticker: "TSLA", amountUsd: 10, schedule: { every: "day" } },
      ]),
      [history("AAPL", Array(5).fill(100)), late],
      { costPct: 0 },
    );
    expect(r.start).toBe(START + 3 * DAY);
    expect(r.trades).toHaveLength(4);
  });
});
