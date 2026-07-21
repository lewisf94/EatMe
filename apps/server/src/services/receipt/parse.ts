import type { OcrResult } from "@eatme/shared";

export type ParsedLine = {
  rawText: string;
  normalizedText: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
  confidence: number | null;
};
export type ParsedReceipt = {
  merchant: string | null;
  purchasedAt: string | null;
  lines: ParsedLine[];
};

const MERCHANTS: Array<[RegExp, string]> = [
  [/tesco/i, "Tesco"],
  [/sainsbury/i, "Sainsbury's"],
  [/asda/i, "Asda"],
  [/morrison/i, "Morrisons"],
  [/\baldi\b/i, "Aldi"],
  [/\blidl\b/i, "Lidl"],
  [/waitrose/i, "Waitrose"],
  [/co-?op/i, "Co-op"],
  [/marks\s*&?\s*spencer|m&s/i, "M&S"],
  [/iceland/i, "Iceland"],
];

// Lines that are never products: totals, tender, loyalty, tax, store/legal noise.
const SKIP =
  /\b(sub-?total|total|balance|change|cash|card|visa|mastercard|amex|contactless|tendered?|amount due|to pay|vat(?:\s|$|-)|vat\s*reg|clubcard|nectar|points?|saving[s]?|multibuy|offer|voucher|receipt|thank\s*you|store\b|till\b|operator|cashier|www\.|http|reg(?:ister)?\b|tel[:\s]|phone|©|number of items|items? sold|order|barcode)\b/i;

// A carrier bag isn't food but does have a price — drop it explicitly.
const BAG = /\b(carrier\s*bag|bag\s*for\s*life|\bbag\b(?!el))/i;

// Trailing price like "£1.29", "1.29", "1.29 A" (VAT code), "-0.50" (discount).
const PRICE = /(-?)\s*£?\s*(\d{1,3}\.\d{2})\s*[A-Za-z*]?\s*$/;
// Leading quantity: "2 x", "2 @", "2X", or a bare small integer + space.
const QTY = /^\s*(\d{1,2})\s*(?:x|@)\s*/i;
// A UK date on the receipt (dd/mm/yy or dd/mm/yyyy).
const DATE = /\b([0-3]?\d)[/.-]([01]?\d)[/.-](\d{2}|\d{4})\b/;

/** Alias key: lowercase, strip price/qty/vat noise and punctuation, collapse space. */
export function normalize(text: string): string {
  return text
    .replace(PRICE, "")
    .replace(QTY, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function detectMerchant(ocr: OcrResult): string | null {
  if (ocr.merchant) return ocr.merchant;
  const head = ocr.lines
    .slice(0, 6)
    .map((l) => l.text)
    .join(" ");
  for (const [re, name] of MERCHANTS) if (re.test(head)) return name;
  return null;
}

function detectDate(ocr: OcrResult): string | null {
  for (const l of ocr.lines) {
    const m = DATE.exec(l.text);
    if (m) {
      const [, d, mo, y] = m;
      const year = y.length === 2 ? "20" + y : y;
      return `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }
  return null;
}

/**
 * Turn raw OCR lines into candidate product lines: keep lines with a name and a
 * (positive) price, dropping totals/tender/loyalty/store noise, carrier bags and
 * discounts. Pure — the same OCR always yields the same lines (unit-tested).
 */
export function parseReceipt(ocr: OcrResult): ParsedReceipt {
  const lines: ParsedLine[] = [];
  for (const l of ocr.lines) {
    const raw = l.text.trim();
    if (!raw) continue;
    if (SKIP.test(raw) || BAG.test(raw)) continue;

    const priceM = PRICE.exec(raw);
    const negative = priceM?.[1] === "-";
    const price = priceM ? Number(priceM[2]) : null;
    // Drop discount lines (negative price) and lines with no price at all — the
    // latter are usually headers/addresses, not items.
    if (price == null || negative) continue;

    const qtyM = QTY.exec(raw);
    const quantity = qtyM ? Math.max(1, Number(qtyM[1])) : 1;

    const name = normalize(raw);
    if (name.replace(/[0-9\s]/g, "").length < 2) continue; // needs real letters

    lines.push({
      rawText: raw,
      normalizedText: name,
      quantity,
      unitPrice: quantity > 1 && price != null ? Number((price / quantity).toFixed(2)) : price,
      lineTotal: price,
      confidence: l.confidence ?? null,
    });
  }
  return { merchant: detectMerchant(ocr), purchasedAt: detectDate(ocr), lines };
}
