import { describe, it, expect } from "vitest";
import type { InventoryRow, Status, DateType } from "@eatme/shared";
import { mkdtempSync, existsSync, statSync, rmSync } from "node:fs";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { weeklyDigest, useByTomorrow, jobsDue, isGone } from "../src/services/push-rules.js";
import { loadOrCreateVapid } from "../src/services/vapid.js";

const row = (
  name: string,
  status: Status,
  pressureKind: DateType | "open_life" | null = "best_before",
  daysLeft: number | null = 3,
): InventoryRow => ({
  productId: name,
  name,
  brand: null,
  categoryId: "c1",
  locationId: "l1",
  lotCount: 1,
  totalCount: 1,
  fractionLeft: 1,
  status,
  pressureDate: "2026-07-25",
  pressureKind,
  daysLeft,
  startDate: "2026-07-20",
  startKind: "added",
  createdAt: "2026-07-20T00:00:00.000Z",
});

describe("weekly digest", () => {
  it("says nothing when there is nothing to say", () => {
    expect(weeklyDigest([row("Cumin", "ok")])).toBeNull();
    expect(weeklyDigest([])).toBeNull();
  });

  it("counts what to use and what has already slipped", () => {
    const p = weeklyDigest([
      row("Pesto", "use_soon"),
      row("Basil", "use_soon"),
      row("Bread", "past_best"),
      row("Cumin", "ok"),
    ]);
    expect(p?.body).toBe("2 things to use this week · 1 already past its best");
    expect(p?.url).toBe("/use-it-up");
  });

  it("gets the singular right", () => {
    expect(weeklyDigest([row("Pesto", "use_soon")])?.body).toBe("1 thing to use this week");
  });
});

describe("day-before warning", () => {
  it("only warns for a use-by — a best-before is not a safety matter", () => {
    expect(useByTomorrow([row("Bread", "use_soon", "best_before", 1)])).toBeNull();
    expect(useByTomorrow([row("Yoghurt", "use_soon", "open_life", 1)])).toBeNull();
    expect(useByTomorrow([row("Chicken", "use_soon", "use_by", 1)])?.title).toBe(
      "Chicken — use by tomorrow",
    );
  });

  it("ignores use-bys that aren't tomorrow", () => {
    expect(useByTomorrow([row("Chicken", "use_soon", "use_by", 2)])).toBeNull();
    expect(useByTomorrow([row("Chicken", "past_use_by", "use_by", -1)])).toBeNull();
  });

  it("names a few and counts the rest", () => {
    const p = useByTomorrow([
      row("Chicken", "use_soon", "use_by", 1),
      row("Fish", "use_soon", "use_by", 1),
      row("Pesto", "use_soon", "use_by", 1),
      row("Cream", "use_soon", "use_by", 1),
    ]);
    expect(p?.title).toBe("Use by tomorrow");
    expect(p?.body).toBe("Chicken, Fish, Pesto and 1 other");
  });
});

describe("job scheduling", () => {
  const never = { digest: "", expiry: "" };
  const monday = { date: "2026-07-27", weekday: 1, hour: 9 };

  it("sends the digest on Monday morning, and the expiry check daily", () => {
    expect(jobsDue(monday, never)).toEqual(["digest", "expiry"]);
    expect(jobsDue({ date: "2026-07-28", weekday: 2, hour: 9 }, never)).toEqual(["expiry"]);
  });

  it("waits until the target hour", () => {
    expect(jobsDue({ ...monday, hour: 7 }, never)).toEqual([]);
    expect(jobsDue({ ...monday, hour: 8 }, never)).toEqual(["expiry"]);
  });

  it("fires at most once a day, so a restart can't double-send", () => {
    expect(jobsDue(monday, { digest: "2026-07-27", expiry: "2026-07-27" })).toEqual([]);
    expect(jobsDue(monday, { digest: "2026-07-20", expiry: "2026-07-27" })).toEqual(["digest"]);
  });

  it("still sends later in the day if the server was asleep at the target hour", () => {
    expect(jobsDue({ ...monday, hour: 22 }, never)).toEqual(["digest", "expiry"]);
  });
});

describe("delivery failures", () => {
  it("only treats 404/410 as 'this subscription is gone'", () => {
    expect(isGone({ statusCode: 410 })).toBe(true);
    expect(isGone({ statusCode: 404 })).toBe(true);
    // A push service that is down, rate-limiting, or refusing us is a delivery
    // problem — deleting the subscription would lose the device for good.
    expect(isGone({ statusCode: 500 })).toBe(false);
    expect(isGone({ statusCode: 429 })).toBe(false);
    expect(isGone({ statusCode: 403 })).toBe(false);
    expect(isGone(new Error("network down"))).toBe(false);
    expect(isGone(null)).toBe(false);
  });
});

describe("VAPID keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "eatme-vapid-"));

  it("is generated once and then reused — a restart must not break subscribers", () => {
    const first = loadOrCreateVapid(dir);
    expect(first.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(existsSync(join(dir, "vapid.json"))).toBe(true);

    // A fresh call is what a server restart does: same file, same key.
    expect(loadOrCreateVapid(dir)).toEqual(first);
  });

  it.skipIf(platform() === "win32")("keeps the private key to itself", () => {
    loadOrCreateVapid(dir);
    expect(statSync(join(dir, "vapid.json")).mode & 0o077).toBe(0);
  });

  it("generates a new pair only when the file is gone", () => {
    const before = loadOrCreateVapid(dir);
    rmSync(join(dir, "vapid.json"));
    expect(loadOrCreateVapid(dir).publicKey).not.toBe(before.publicKey);
  });
});
