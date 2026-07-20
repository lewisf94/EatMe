import { describe, it, expect } from "vitest";
import { computeStatus, type Category } from "@whattoeat/shared";

type CatBits = Pick<Category, "openLifeDays" | "warnDays" | "hardExpiry">;
const cat = (o: Partial<CatBits> = {}): CatBits => ({
  openLifeDays: o.openLifeDays ?? null,
  warnDays: o.warnDays ?? 14,
  hardExpiry: o.hardExpiry ?? false,
});

const today = new Date("2026-07-20T00:00:00Z");
function plusDays(n: number): string {
  const d = new Date(today);
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
