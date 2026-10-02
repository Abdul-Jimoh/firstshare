import type { Plan } from "./plan.ts";
import { WEEKDAYS } from "./plan.ts";

export interface Holding {
  shares: number;
  cost: number;
}

export interface PlanState {
  holdings: Record<string, Holding>;
  armed: boolean[];
  lastFired: (string | null)[];
  spentByMonth: Record<string, number>;
}

export interface Market {
  day: string;
  price(ticker: string): number | undefined;
  highOver(ticker: string, days: number): number | undefined;
}

export type Intent = { rule: number; ticker: string; side: "buy"; usd: number } | { rule: number; ticker: string; side: "sell"; fraction: number };

// Level-triggered rules (dip, below, take profit) fire once on crossing and re-arm only after the price
// moves back past the threshold with some margin, so a stock sitting below a line doesn't buy every day.
const REARM = { dipFraction: 0.5, belowMargin: 1.02, profitMargin: 0.98 };

export function newPlanState(plan: Plan): PlanState {
  return { holdings: {}, armed: plan.rules.map(() => true), lastFired: plan.rules.map(() => null), spentByMonth: {} };
}

export function holding(state: PlanState, ticker: string): Holding {
  return (state.holdings[ticker] ??= { shares: 0, cost: 0 });
}

const monthOf = (day: string) => day.slice(0, 7);

// Doesn't change state except to re-arm a level rule; firing is committed separately once the
// caller knows whether the order went through, so a buy blocked by the price check is retried later.
export function evaluateRule(plan: Plan, index: number, state: PlanState, market: Market): Intent | null {
  const rule = plan.rules[index]!;
  const price = market.price(rule.ticker);
  if (price === undefined) return null;
  const armed = state.armed[index];
  switch (rule.kind) {
    case "buy_schedule": {
      const s = rule.schedule;
      const date = new Date(`${market.day}T00:00:00Z`);
      const due = s.every === "day" || (s.every === "week" && s.on === WEEKDAYS[date.getUTCDay()]) || (s.every === "month" && s.on === date.getUTCDate());
      return due && state.lastFired[index] !== market.day ? { rule: index, ticker: rule.ticker, side: "buy", usd: rule.amountUsd } : null;
    }
    case "buy_dip": {
      const high = market.highOver(rule.ticker, rule.lookbackDays);
      if (high === undefined) return null;
      const dropPct = (1 - price / high) * 100;
      if (armed && dropPct >= rule.dropPct) return { rule: index, ticker: rule.ticker, side: "buy", usd: rule.amountUsd };
      if (!armed && dropPct < rule.dropPct * REARM.dipFraction) state.armed[index] = true;
      return null;
    }
    case "buy_below":
      if (armed && price < rule.priceUsd) return { rule: index, ticker: rule.ticker, side: "buy", usd: rule.amountUsd };
      if (!armed && price > rule.priceUsd * REARM.belowMargin) state.armed[index] = true;
      return null;
    case "take_profit": {
      const h = holding(state, rule.ticker);
      if (h.shares <= 0) return null;
      const target = (h.cost / h.shares) * (1 + rule.gainPct / 100);
      if (armed && price >= target) return { rule: index, ticker: rule.ticker, side: "sell", fraction: rule.sellPct / 100 };
      if (!armed && price < target * REARM.profitMargin) state.armed[index] = true;
      return null;
    }
  }
}

export function capAllows(plan: Plan, state: PlanState, usd: number, day: string): boolean {
  return plan.monthlyCapUsd === null || (state.spentByMonth[monthOf(day)] ?? 0) + usd <= plan.monthlyCapUsd;
}

// Marks a rule as used for this firing without trading, e.g. when the monthly limit blocks it.
export function commitSkip(plan: Plan, state: PlanState, intent: Intent, day: string): void {
  if (plan.rules[intent.rule]!.kind === "buy_schedule") state.lastFired[intent.rule] = day;
  else state.armed[intent.rule] = false;
}

export interface Fill {
  shares: number;
  usd: number;
}

export function commitFill(plan: Plan, state: PlanState, intent: Intent, fill: Fill, day: string): void {
  commitSkip(plan, state, intent, day);
  const h = holding(state, intent.ticker);
  if (intent.side === "buy") {
    h.shares += fill.shares;
    h.cost += fill.usd;
    state.spentByMonth[monthOf(day)] = (state.spentByMonth[monthOf(day)] ?? 0) + fill.usd;
  } else {
    h.cost *= 1 - fill.shares / h.shares;
    h.shares -= fill.shares;
  }
}
