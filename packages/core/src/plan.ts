export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type Schedule = { every: "day" } | { every: "week"; on: Weekday } | { every: "month"; on: number };

export type Rule =
  | { kind: "buy_schedule"; ticker: string; amountUsd: number; schedule: Schedule }
  | { kind: "buy_dip"; ticker: string; amountUsd: number; dropPct: number; lookbackDays: number }
  | { kind: "buy_below"; ticker: string; amountUsd: number; priceUsd: number }
  | { kind: "take_profit"; ticker: string; gainPct: number; sellPct: number };

// Every buy also has to pass the pre-trade check; that guard is implicit and can't be switched off.
export interface Plan {
  version: 1;
  name: string;
  rules: Rule[];
  monthlyCapUsd: number | null;
}

export const LIMITS = {
  rules: 6,
  minBuyUsd: 1,
  maxBuyUsd: 1_000,
  maxMonthlyCapUsd: 10_000,
  maxLookbackDays: 90,
} as const;

export class PlanError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "PlanError";
  }
}

const isNum = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

function ruleProblems(r: Rule, i: number, knownTickers: ReadonlySet<string> | null): string[] {
  const at = `Rule ${i + 1}:`;
  const out: string[] = [];
  if (typeof r.ticker !== "string" || !/^[A-Z.]{1,8}$/.test(r.ticker)) out.push(`${at} unknown company.`);
  else if (knownTickers && !knownTickers.has(r.ticker)) out.push(`${at} ${r.ticker} isn't available as a tokenized stock.`);
  if (r.kind !== "take_profit" && !isNum(r.amountUsd, LIMITS.minBuyUsd, LIMITS.maxBuyUsd)) {
    out.push(`${at} each buy has to be between $${LIMITS.minBuyUsd} and $${LIMITS.maxBuyUsd}.`);
  }
  switch (r.kind) {
    case "buy_schedule": {
      const s = r.schedule;
      if (s?.every === "week" && !WEEKDAYS.includes(s.on)) out.push(`${at} pick a day of the week.`);
      else if (s?.every === "month" && !(Number.isInteger(s.on) && s.on >= 1 && s.on <= 28)) out.push(`${at} pick a day of the month from 1 to 28.`);
      else if (!["day", "week", "month"].includes(s?.every)) out.push(`${at} say how often to buy.`);
      break;
    }
    case "buy_dip":
      if (!isNum(r.dropPct, 1, 50)) out.push(`${at} the drop has to be between 1% and 50%.`);
      if (!(Number.isInteger(r.lookbackDays) && r.lookbackDays >= 2 && r.lookbackDays <= LIMITS.maxLookbackDays)) {
        out.push(`${at} "recent high" has to look back between 2 and ${LIMITS.maxLookbackDays} days.`);
      }
      break;
    case "buy_below":
      if (!isNum(r.priceUsd, 0.01, 1_000_000)) out.push(`${at} the price has to be a positive dollar amount.`);
      break;
    case "take_profit":
      if (!isNum(r.gainPct, 1, 1_000)) out.push(`${at} the gain has to be between 1% and 1000%.`);
      if (!isNum(r.sellPct, 1, 100)) out.push(`${at} sell between 1% and 100% of what you hold.`);
      break;
    default:
      out.push(`${at} not a kind of rule Firstshare understands.`);
  }
  return out;
}

export function validatePlan(plan: Plan, knownTickers: ReadonlySet<string> | null = null): Plan {
  const problems: string[] = [];
  if (plan.version !== 1) problems.push("Unsupported plan version.");
  if (typeof plan.name !== "string" || !plan.name.trim()) problems.push("Give the plan a name.");
  if (!Array.isArray(plan.rules) || plan.rules.length === 0) problems.push("A plan needs at least one rule.");
  else if (plan.rules.length > LIMITS.rules) problems.push(`A plan can have at most ${LIMITS.rules} rules.`);
  else plan.rules.forEach((r, i) => problems.push(...ruleProblems(r, i, knownTickers)));
  if (plan.monthlyCapUsd !== null && !isNum(plan.monthlyCapUsd, LIMITS.minBuyUsd, LIMITS.maxMonthlyCapUsd)) {
    problems.push(`The monthly limit has to be between $${LIMITS.minBuyUsd} and $${LIMITS.maxMonthlyCapUsd}.`);
  }
  if (plan.rules?.length && plan.rules.every((r) => r.kind === "take_profit")) problems.push("A plan needs at least one rule that buys.");
  if (problems.length) throw new PlanError(problems);
  return plan;
}

const DAY_NAMES: Record<Weekday, string> = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}

const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

export function describeRule(r: Rule, nameOf: (ticker: string) => string = (t) => t): string {
  const name = nameOf(r.ticker);
  switch (r.kind) {
    case "buy_schedule": {
      const s = r.schedule;
      const when = s.every === "day" ? "every day" : s.every === "week" ? `every ${DAY_NAMES[s.on]}` : `on the ${ordinal(s.on)} of every month`;
      return `Buy ${usd(r.amountUsd)} of ${name} ${when}.`;
    }
    case "buy_dip":
      return `Buy ${usd(r.amountUsd)} of ${name} when it falls ${r.dropPct}% below its highest price of the last ${r.lookbackDays} days.`;
    case "buy_below":
      return `Buy ${usd(r.amountUsd)} of ${name} when a share costs less than ${usd(r.priceUsd)}.`;
    case "take_profit":
      return r.sellPct >= 100
        ? `Sell all my ${name} when I'm up ${r.gainPct}% on it.`
        : `Sell ${r.sellPct}% of my ${name} when I'm up ${r.gainPct}% on it.`;
  }
}

export function planTickers(plan: Plan): string[] {
  return [...new Set(plan.rules.map((r) => r.ticker))];
}
