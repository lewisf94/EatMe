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
  // Real OCR output from an unevenly lit Aldi receipt photo, including stray marks.
  const photo: OcrResult = {
    lines: [
      { text: "ALDI STORES" },
      { text: "North Road RP" },
      { text: "4 GBP" },
      { text: "337432 BISKS WHEATS 2.19 A" },
      { text: "8 2X 1.99" },
      { text: ": 880571 NUT BARS 3.98 B" },
      { text: "Y 384145 NUTS MIXED 1.75 A" },
      { text: "ge 2x 0.65" },
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

describe("parseReceipt on OCR rows that lost part of the text", () => {
  it("uses a lone unit price for the quantity when the total is a multiple", () => {
    const r = parseReceipt({
      lines: [
        { text: "660363 EXTRA FINE BEANS 1.55 A" },
        { text: "0.39" },
        { text: "618715 XL GARLIC EACH 0.78 A" },
        { text: "CHICKEN FILLET 1KG 6.69 A" },
        { text: "\u201d Q.69" },
        { text: "726862 RTH LIME / COCONUT 1.38 A" },
      ],
    });
    expect(r.lines.map((l) => [l.normalizedText, l.quantity, l.unitPrice])).toEqual([
      ["extra fine beans", 1, 1.55],
      ["xl garlic each", 2, 0.39],
      ["chicken fillet 1kg", 1, 6.69],
      ["rth lime coconut", 2, 0.69],
    ]);
  });

  it("skips a stray mark between a quantity row and its product", () => {
    const r = parseReceipt({
      lines: [{ text: "4 2x 1.99" }, { text: "3" }, { text: ": 580571 NUT BARS 3.98 B" }],
    });
    expect(r.lines.map((l) => [l.normalizedText, l.quantity])).toEqual([["nut bars", 2]]);
  });

  it("drops a spaced-out total that equals the sum of the lines", () => {
    const r = parseReceipt({
      lines: [
        { text: "BAKED BEANS 1.00 A" },
        { text: "PESTO 1.00 A" },
        { text: "BREAD 2.00 A" },
        { text: "T \u00a9 a 1 4.00" },
      ],
    });
    expect(r.lines.map((l) => l.normalizedText)).toEqual(["baked beans", "pesto", "bread"]);
  });
});

describe("parseReceipt on a Tesco receipt with a quantity column", () => {
  const r = parseReceipt({
    lines: [
      { text: "Batley Extra" },
      { text: "1 Lucozade Sport Drink £4.50" },
      { text: "X 500ml |" },
      { text: "Cc £3.00" },
      { text: "1 Rowse Organic Squeezy Honey £3.35" },
      { text: "340g" },
      { text: "Co £3.00 -£0.35" },
      { text: "1 Tesco Summer Fruit Platter" },
      { text: "Price Marked:" },
      { text: "1 Whole Milk £0.85" },
      { text: "2 Tesco Angel Cake £2.60" },
      { text: "Vanilla 6 Pack 160g" },
      { text: "£1.30 each" },
      { text: "£4.00" },
      { text: "1 Cadbury" },
      { text: "chocolate mini" },
      { text: "Co £2.45 £1.10" },
      { text: "Tesco Cheese & Onion Crisps" },
      { text: "6x £1.10" },
      { text: "Tesco Ready Salted Crisps" },
      { text: "TOTAL £20.50" },
      { text: "Thank you for shopping" },
    ],
  });

  it("joins long names, reads the quantity column and skips Clubcard rows", () => {
    expect(r.lines.map((l) => [l.normalizedText, l.quantity, l.unitPrice, l.lineTotal])).toEqual([
      ["lucozade sport drink x 500ml", 1, 4.5, 4.5],
      ["rowse organic squeezy honey 340g", 1, 3.35, 3.35],
      ["tesco summer fruit platter", 1, null, null],
      ["whole milk", 1, 0.85, 0.85],
      ["tesco angel cake vanilla 6 pack 160g", 2, 1.3, 2.6],
      ["cadbury chocolate mini", 1, 4, 4],
      ["tesco cheese onion crisps", 1, 1.1, 1.1],
      ["tesco ready salted crisps", 1, null, null],
    ]);
  });

  it("does not use the quantity column on a receipt without one", () => {
    const aldi = parseReceipt({
      lines: [{ text: "1 Tesco Milk £1.00" }, { text: "MIXED HERBS 1.04" }, { text: "340g" }],
    });
    expect(aldi.lines.map((l) => l.normalizedText)).toEqual(["1 tesco milk", "mixed herbs"]);
  });
});

describe("parseReceipt on hard OCR rows", () => {
  it("uses another price reading when it makes the lines add up to the total", () => {
    const r = parseReceipt({
      lines: [
        { text: "OX0 CUBES 0.83" },
        { text: "TWIN GARLIC 1.06", priceAlternatives: ["1.00"] },
        { text: "KER TOMATO170 1.25 ||" },
        { text: "TOTAL 3.08", priceAlternatives: ["9.08"] },
      ],
    });
    expect(r.lines.map((l) => [l.normalizedText, l.lineTotal])).toEqual([
      ["oxo cubes", 0.83],
      ["twin garlic", 1],
      ["ker tomato170", 1.25],
    ]);
  });

  it("keeps the first reading when no other reading matches the total", () => {
    const r = parseReceipt({
      lines: [
        { text: "TWIN GARLIC 1.06", priceAlternatives: ["1.50"] },
        { text: "PLUMS 1.39" },
        { text: "TOTAL 9.99" },
      ],
    });
    expect(r.lines.map((l) => l.lineTotal)).toEqual([1.06, 1.39]);
  });

  it("reads a quantity row where OCR read the x as a quote mark", () => {
    const r = parseReceipt({
      lines: [
        { text: "388067 CHICKEN FILLET 1KG 6.69 A" },
        { text: "2 \u201d 0.69" },
        { text: "726862 RTH LIME / COCONUT 1.38 A" },
      ],
    });
    expect(r.lines.map((l) => [l.normalizedText, l.quantity])).toEqual([
      ["chicken fillet 1kg", 1],
      ["rth lime coconut", 2],
    ]);
  });

  it("drops a spaced-out total read with a short word", () => {
    const r = parseReceipt({
      lines: [
        { text: "NUTS MIXED 1.75 A" },
        { text: "PEANUTS SALTED 0.59 A" },
        { text: "Toa t a 1 2.34" },
      ],
    });
    expect(r.lines.map((l) => l.normalizedText)).toEqual(["nuts mixed", "peanuts salted"]);
  });
});

describe("parseReceipt on a curved Tesco receipt", () => {
  const r = parseReceipt({
    lines: [
      { text: "1 Rowse Organic Squeezy Honey £3.35" },
      { text: "| Co £3.00 -£0.35" },
      { text: "1 Tesco Finest Super Seeded £1.75" },
      { text: "2 Tesco Angel Cake Slices - £2.60" },
      { text: "Vanilla 6 Pack 160g" },
      { text: "£1.30 each £4.00" },
      { text: "1 Cadbury" },
      { text: "Rolls cakes 10 Pack" },
      { text: "| Co £2.45 |" },
      { text: "1 Tesco Cheese & Onion Crisps £1.10" },
      { text: "6x25g" },
      { text: "Tesco Ready Salted Crisps £1.10" },
    ],
  });

  it("reads a dash before a price as text, not as a discount", () => {
    expect(r.lines[2]).toMatchObject({ quantity: 2, unitPrice: 1.3, lineTotal: 2.6 });
  });

  it("gives a price on the unit price row to the next product", () => {
    expect(r.lines[3]).toMatchObject({
      normalizedText: "cadbury rolls cakes 10 pack",
      lineTotal: 4,
    });
  });

  it("starts a new product at a second priced row", () => {
    expect(r.lines.slice(4).map((l) => [l.normalizedText, l.lineTotal])).toEqual([
      ["tesco cheese onion crisps 25g", 1.1],
      ["tesco ready salted crisps", 1.1],
    ]);
  });
});
