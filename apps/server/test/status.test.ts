import { describe, it, expect } from "vitest";
import { computeStatus, civilToday, type DateType } from "@eatme/shared";

const cat = (openLifeDays: number | null = null, warnDays = 14) => ({ openLifeDays, warnDays });

// `computeStatus` takes a civil YYYY-MM-DD string (not a Date) so the day maths
// is timezone-stable. plusDays does its offset in UTC then formats back to civil.
const today = "2026-07-20";
function plusDays(n: number): string {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const lot = (o: {
  dateType?: DateType;
  dateValue?: string;
  openedAt?: string;
  openLifeDaysOverride?: number;
}) => ({
  dateType: o.dateType ?? null,
  dateValue: o.dateValue ?? null,
  openedAt: o.openedAt ?? null,
  openLifeDaysOverride: o.openLifeDaysOverride ?? null,
});

describe("computeStatus", () => {
  it("no dates → ok, no judgement", () => {
    const r = computeStatus(lot({}), cat(), today);
    expect(r.status).toBe("ok");
    expect(r.pressureDate).toBeNull();
  });

  it("best-before in 3 days → use_soon", () => {
    const r = computeStatus(lot({ dateType: "best_before", dateValue: plusDays(3) }), cat(), today);
    expect(r.status).toBe("use_soon");
    expect(r.daysLeft).toBe(3);
  });

  it("passed best-before → past_best (quality, not 'expired')", () => {
    const r = computeStatus(
      lot({ dateType: "best_before", dateValue: plusDays(-2) }),
      cat(),
      today,
    );
    expect(r.status).toBe("past_best");
  });

  it("passed use-by → past_use_by (safety)", () => {
    const r = computeStatus(lot({ dateType: "use_by", dateValue: plusDays(-2) }), cat(), today);
    expect(r.status).toBe("past_use_by");
  });

  it("opened spice past its open-life (no printed date) → quality_declining", () => {
    const r = computeStatus(lot({ openedAt: plusDays(-400) }), cat(270), today);
    expect(r.status).toBe("quality_declining");
  });

  it("the lot's open-life override beats the category fallback", () => {
    // opened 10d ago + 20d override = 10 days left → use_soon (category says 270)
    const r = computeStatus(
      lot({ openedAt: plusDays(-10), openLifeDaysOverride: 20 }),
      cat(270, 14),
      today,
    );
    expect(r.status).toBe("use_soon");
    expect(r.daysLeft).toBe(10);
  });

  it("nearest upcoming clock wins (sooner of two)", () => {
    const r = computeStatus(
      lot({
        dateType: "best_before",
        dateValue: plusDays(90),
        openedAt: plusDays(-10),
        openLifeDaysOverride: 20,
      }),
      cat(270, 14),
      today,
    );
    expect(r.status).toBe("use_soon");
    expect(r.daysLeft).toBe(10);
  });

  it("safety wins when both a use-by and the open-life have passed", () => {
    // use-by passed 2d ago, open-life passed further back → past_use_by, and the
    // governing date is the use-by (not the more-negative open-life clock).
    const r = computeStatus(
      lot({
        dateType: "use_by",
        dateValue: plusDays(-2),
        openedAt: plusDays(-30),
        openLifeDaysOverride: 20,
      }),
      cat(null, 14),
      today,
    );
    expect(r.status).toBe("past_use_by");
    expect(r.pressureDate).toBe(plusDays(-2));
  });
});

describe("civilToday", () => {
  it("returns the *local* civil date across UTC midnight (BST off-by-one guard)", () => {
    // 23:30 UTC on 20 Jul is already 00:30 on 21 Jul in British Summer Time.
    const nearMidnight = new Date("2026-07-20T23:30:00Z");
    expect(civilToday("Europe/London", nearMidnight)).toBe("2026-07-21");
    expect(civilToday("UTC", nearMidnight)).toBe("2026-07-20");
  });

  it("returns a YYYY-MM-DD string", () => {
    expect(civilToday("Europe/London", new Date("2026-01-15T12:00:00Z"))).toBe("2026-01-15");
  });
});
