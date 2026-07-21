import { describe, it, expect } from "vitest";
import { mapOff, cacheIsFresh } from "../src/services/off";

describe("mapOff", () => {
  it("maps a found product", () => {
    const r = mapOff("5000159407236", {
      status: 1,
      product: {
        product_name: "Snickers",
        brands: "Mars",
        quantity: "48 g",
        image_front_small_url: "https://images.off/x.jpg",
      },
    });
    expect(r).toEqual({
      found: true,
      barcode: "5000159407236",
      name: "Snickers",
      brand: "Mars",
      size: "48 g",
      imageUrl: "https://images.off/x.jpg",
    });
  });

  it("status 0 → not found (keeps the barcode)", () => {
    expect(mapOff("0000000000000", { status: 0 })).toEqual({
      found: false,
      barcode: "0000000000000",
    });
  });

  it("missing product → not found", () => {
    expect(mapOff("123", {})).toEqual({ found: false, barcode: "123" });
  });
});

describe("cacheIsFresh", () => {
  const now = Date.parse("2026-07-20T12:00:00Z");
  const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();

  it("keeps a hit for ~30 days", () => {
    expect(cacheIsFresh(true, daysAgo(10), now)).toBe(true);
    expect(cacheIsFresh(true, daysAgo(29), now)).toBe(true);
    expect(cacheIsFresh(true, daysAgo(31), now)).toBe(false);
  });

  it("expires a miss after ~3 days (so newly-added products get picked up)", () => {
    expect(cacheIsFresh(false, daysAgo(2), now)).toBe(true);
    expect(cacheIsFresh(false, daysAgo(4), now)).toBe(false);
  });
});
