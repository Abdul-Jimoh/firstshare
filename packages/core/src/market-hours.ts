export type UsSession = "premarket" | "regular" | "afterhours" | "closed";

export interface UsMarketState {
  session: UsSession;
  isHoliday: boolean;
  nextOpen: Date;
  nextClose: Date | null;
}

// NYSE full-day closures. Early closes (1pm) are treated as full days.
const HOLIDAYS = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19",
  "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18",
  "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;
const PRE_MIN = 4 * 60;
const AFTER_END_MIN = 20 * 60;

const nyParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});

function inNewYork(d: Date) {
  const p = Object.fromEntries(nyParts.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    weekday: p.weekday as string,
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

function isTradingDay(nyDate: string, weekday: string) {
  return weekday !== "Sat" && weekday !== "Sun" && !HOLIDAYS.has(nyDate);
}

// Finds the UTC instant for a New York wall-clock time on the same NY calendar day as `day`.
function nyTimeOn(day: Date, minutes: number): Date {
  const { date } = inNewYork(day);
  const guess = new Date(`${date}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00Z`);
  for (const offsetHours of [4, 5]) {
    const candidate = new Date(guess.getTime() + offsetHours * 3_600_000);
    const ny = inNewYork(candidate);
    if (ny.date === date && ny.minutes === minutes) return candidate;
  }
  throw new Error(`cannot resolve New York time for ${date}`);
}

export function usMarketState(now: Date = new Date()): UsMarketState {
  const ny = inNewYork(now);
  const tradingToday = isTradingDay(ny.date, ny.weekday);

  let session: UsSession = "closed";
  if (tradingToday) {
    if (ny.minutes >= OPEN_MIN && ny.minutes < CLOSE_MIN) session = "regular";
    else if (ny.minutes >= PRE_MIN && ny.minutes < OPEN_MIN) session = "premarket";
    else if (ny.minutes >= CLOSE_MIN && ny.minutes < AFTER_END_MIN) session = "afterhours";
  }

  let nextOpen: Date | null = null;
  if (tradingToday && ny.minutes < OPEN_MIN) nextOpen = nyTimeOn(now, OPEN_MIN);
  for (let i = 1; !nextOpen && i <= 10; i++) {
    const day = new Date(now.getTime() + i * 86_400_000);
    const d = inNewYork(day);
    if (isTradingDay(d.date, d.weekday)) nextOpen = nyTimeOn(day, OPEN_MIN);
  }

  return {
    session,
    isHoliday: HOLIDAYS.has(ny.date),
    nextOpen: nextOpen!,
    nextClose: session === "regular" ? nyTimeOn(now, CLOSE_MIN) : null,
  };
}
