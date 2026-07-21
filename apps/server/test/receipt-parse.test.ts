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
