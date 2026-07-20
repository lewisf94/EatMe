import { describe, it, expect } from "vitest";
import { mapOff } from "../src/services/off";

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
