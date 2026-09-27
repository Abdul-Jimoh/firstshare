import { describe, expect, it } from "vitest";
import { usMarketState } from "../src/market-hours.ts";

const at = (iso: string) => usMarketState(new Date(iso));

describe("usMarketState", () => {
  it("is closed on a Saturday and opens Monday 9:30 New York time", () => {
    const s = at("2026-09-26T09:31:00Z");
    expect(s.session).toBe("closed");
    expect(s.nextOpen.toISOString()).toBe("2026-09-28T13:30:00.000Z");
    expect(s.nextClose).toBeNull();
  });

  it("is in the regular session mid-day and closes at 4pm", () => {
    const s = at("2026-09-24T17:00:00Z");
    expect(s.session).toBe("regular");
    expect(s.nextClose!.toISOString()).toBe("2026-09-24T20:00:00.000Z");
    expect(s.nextOpen.toISOString()).toBe("2026-09-25T13:30:00.000Z");
  });

  it("reports premarket and after-hours", () => {
    expect(at("2026-09-24T12:00:00Z").session).toBe("premarket");
    expect(at("2026-09-24T20:39:00Z").session).toBe("afterhours");
  });

  it("skips holidays", () => {
    const s = at("2026-11-26T15:00:00Z");
    expect(s.session).toBe("closed");
    expect(s.isHoliday).toBe(true);
    expect(s.nextOpen.toISOString()).toBe("2026-11-27T14:30:00.000Z");
  });

  it("handles the switch from daylight time", () => {
    expect(at("2026-11-02T14:45:00Z").session).toBe("regular");
    expect(at("2026-11-02T14:15:00Z").session).toBe("premarket");
  });
});
