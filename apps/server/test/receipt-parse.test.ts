import { describe, it, expect } from "vitest";
import { parseReceipt, normalize } from "../src/services/receipt/parse";
import { STUB_RECEIPT } from "../src/services/receipt/ocr";
import type { OcrResult } from "@eatme/shared";

describe("parseReceipt", () => {
  const r = parseReceipt(STUB_RECEIPT);

  it("detects merchant and date", () => {
    expect(r.merchant).toBe("Tesco");
    expect(r.purchasedAt).toBe("2026-07-12");
  });

  it("keeps only the product lines", () => {
    expect(r.lines.map((l) => l.normalizedText)).toEqual([
      "chckpeas 400g",
      "tesco passata 500g",
      "tinned tomatoes",
      "olive oil 500ml",
    ]);
  });

  it("drops totals, tender, loyalty, discounts and the carrier bag", () => {
    const joined = r.lines.map((l) => l.rawText).join(" | ");
    expect(joined).not.toMatch(/total|visa|clubcard|carrier bag/i);
  });

  it("extracts quantity and derives a unit price", () => {
    const tomatoes = r.lines.find((l) => l.normalizedText === "tinned tomatoes")!;
    expect(tomatoes.quantity).toBe(2);
    expect(tomatoes.lineTotal).toBe(0.9);
    expect(tomatoes.unitPrice).toBe(0.45);
  });

  it("normalize strips price, qty and punctuation to a stable alias key", () => {
    expect(normalize("2 x TINNED TOMATOES 0.90")).toBe("tinned tomatoes");
    expect(normalize("TESCO CHCKPEAS 400G £0.45 A")).toBe("tesco chckpeas 400g");
    expect(normalize("CAT FOOD X 0.38")).toBe("cat food");
    expect(normalize("TESCO CRISPS * 0.79")).toBe("tesco crisps");
  });

  it("accepts comma and OCR-spaced prices", () => {
    const parsed = parseReceipt({
      lines: [{ text: "WHOLE MILK 1,45" }, { text: "BROWN BREAD 1 20 A" }],
    });
    expect(parsed.lines.map((line) => [line.normalizedText, line.lineTotal])).toEqual([
      ["whole milk", 1.45],
      ["brown bread", 1.2],
    ]);
  });

  it("drops reduced-price messages instead of creating products", () => {
    const parsed = parseReceipt({
      lines: [{ text: "00 REDUCED PRICE 0.50" }, { text: "WHEAT BISCUITS 1.25" }],
    });
    expect(parsed.lines.map((line) => line.normalizedText)).toEqual(["wheat biscuits"]);
  });
});

describe("parseReceipt on an Aldi-style receipt", () => {
  const aldi: OcrResult = {
    lines: [
      { text: "ALDI STORES LTD" },
      { text: "BAKED BEANS 0.32" },
      { text: "SPECIALLY SELECTED PESTO 1.49 A" },
      { text: "SUBTOTAL 1.81" },
      { text: "TOTAL 1.81" },
      { text: "CARD 1.81" },
      { text: "05/03/26 09:15" },
    ],
  };

  it("detects Aldi and keeps two products", () => {
    const r = parseReceipt(aldi);
    expect(r.merchant).toBe("Aldi");
    expect(r.purchasedAt).toBe("2026-03-05");
    expect(r.lines.map((l) => l.normalizedText)).toEqual([
      "baked beans",
      "specially selected pesto",
    ]);
  });
});

describe("parseReceipt on a photographed Aldi receipt", () => {
  // Real OCR output from a shaded Aldi receipt photo, including stray marks.
  const photo: OcrResult = {
    lines: [
      { text: "ALDI STORES" },
      { text: "North Road RP" },
      { text: "4 GBP" },
      { text: "337432 BISKS WHEATS 2.19 A" },
      { text: "8 2X 1.99" },
      { text: ": 880571 NUT BARS 3.98 B" },
      { text: "Y 384145 NUTS MIXED 1.75 A" },
      { text: "& <2 xX 0.65" },
      { text: "S 319760 FRUIT & NUT MIX 1.30 A" },
      { text: "494905 100% PEANUT BUTTER 3.99 A" },
      { text: "683160 NATURAL YOGHURT 0.75 A" },
      { text: "3 xX 1.25" },
      { text: "688755 GANACHE POTS 3.75 A" },
      { text: "403915 HOUMOUS 200G 0.95 A" },
      { text: "27 Items" },
      { text: "Card Sales GBP 41.89" },
    ],
  };
  const r = parseReceipt(photo);

  it("removes the item codes and stray marks from the names", () => {
    expect(r.merchant).toBe("Aldi");
    expect(r.lines.map((l) => l.normalizedText)).toEqual([
      "bisks wheats",
      "nut bars",
      "nuts mixed",
      "fruit nut mix",
      "100 peanut butter",
      "natural yoghurt",
      "ganache pots",
      "houmous 200g",
    ]);
  });

  it("applies a quantity row printed above the product", () => {
    const qty = Object.fromEntries(
      r.lines.map((l) => [l.normalizedText, [l.quantity, l.unitPrice]]),
    );
    expect(qty["nut bars"]).toEqual([2, 1.99]);
    expect(qty["fruit nut mix"]).toEqual([2, 0.65]);
    expect(qty["ganache pots"]).toEqual([3, 1.25]);
    expect(qty["bisks wheats"]).toEqual([1, 2.19]);
    expect(qty["natural yoghurt"]).toEqual([1, 0.75]);
  });

  it("applies a quantity row printed below the product when the total matches", () => {
    const lidl = parseReceipt({
      lines: [{ text: "MILK 1.98 A" }, { text: "2 x 0.99" }, { text: "BREAD 0.85 A" }],
    });
    expect(lidl.lines.map((l) => [l.normalizedText, l.quantity, l.unitPrice])).toEqual([
      ["milk", 2, 0.99],
      ["bread", 1, 0.85],
    ]);
  });
});
