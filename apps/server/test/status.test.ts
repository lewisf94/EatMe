import { describe, it, expect } from "vitest";
import { computeStatus, civilToday, type Category } from "@whattoeat/shared";

type CatBits = Pick<Category, "openLifeDays" | "warnDays" | "hardExpiry">;
const cat = (o: Partial<CatBits> = {}): CatBits => ({
  openLifeDays: o.openLifeDays ?? null,
  warnDays: o.warnDays ?? 14,
  hardExpiry: o.hardExpiry ?? false,
});

// `computeStatus` takes a civil YYYY-MM-DD string (not a Date) so the day maths
// is timezone-stable. plusDays does its offset in UTC then formats back to civil.
const today = "2026-07-20";
function plusDays(n: number): string {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe("computeStatus", () => {
  it("no dates → ok", () => {
    const r = computeStatus(
      { bestBefore: undefined, openedAt: undefined, openLifeDays: undefined },
      cat(),
      today,
    );
    expect(r.status).toBe("ok");
    expect(r.pressureDate).toBeNull();
  });

  it("best-before in 3 days → use_soon", () => {
    const r = computeStatus(
      { bestBefore: plusDays(3), openedAt: undefined, openLifeDays: undefined },
      cat(),
      today,
    );
    expect(r.status).toBe("use_soon");
    expect(r.daysLeft).toBe(3);
  });

  it("opened ground spice past its open-life → past_best (quality, not hard expiry)", () => {
    const r = computeStatus(
      { bestBefore: undefined, openedAt: plusDays(-400), openLifeDays: undefined },
      cat({ openLifeDays: 270 }),
      today,
    );
    expect(r.status).toBe("past_best");
  });

  it("hard-expiry fridge jar past date → expired", () => {
    const r = computeStatus(
      { bestBefore: plusDays(-2), openedAt: undefined, openLifeDays: undefined },
      cat({ hardExpiry: true }),
      today,
    );
    expect(r.status).toBe("expired");
  });

  it("far future → ok, and the sooner of two clocks wins", () => {
    const r = computeStatus(
      { bestBefore: plusDays(90), openedAt: plusDays(-10), openLifeDays: 20 },
      cat({ openLifeDays: 270, warnDays: 14 }),
      today,
    );
    // opened 10d ago + 20d open-life = 10 days left → use_soon beats the 90-day best-before
    expect(r.status).toBe("use_soon");
    expect(r.daysLeft).toBe(10);
  });
});

describe("civilToday", () => {
  it("returns the *local* civil date across UTC midnight (BST off-by-one guard)", () => {
    // 23:30 UTC on 20 Jul is already 00:30 on 21 Jul in British Summer Time.
    // A naive toISOString().slice(0,10) would report 2026-07-20; we want 21.
    const nearMidnight = new Date("2026-07-20T23:30:00Z");
    expect(civilToday("Europe/London", nearMidnight)).toBe("2026-07-21");
    expect(civilToday("UTC", nearMidnight)).toBe("2026-07-20");
  });

  it("returns a YYYY-MM-DD string", () => {
    expect(civilToday("Europe/London", new Date("2026-01-15T12:00:00Z"))).toBe("2026-01-15");
  });
});
