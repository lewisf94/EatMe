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
  /\b(sub-?total|total|balance|change|cash|card|visa|mastercard|amex|contactless|tendered?|amount due|to pay|vat(?:\s|$|-)|vat\s*reg|clubcard|nectar|points?|saving[s]?|multibuy|offer|voucher|discount|reduced\s*price|reduction|markdown|receipt|thank\s*you|store\b|till\b|operator|cashier|www\.|http|reg(?:ister)?\b|tel[:\s]|phone|©|number of items|items? sold|order|barcode)\b/i;

// A carrier bag isn't food but does have a price — drop it explicitly.
const BAG = /\b(carrier\s*bag|bag\s*for\s*life|\bbag\b(?!el))/i;

// Trailing price like "£1.29", "1,29", "1 29 A" (OCR split), or "-0.50".
const PRICE = /(-?)\s*£?\s*(\d{1,3})\s*(?:[.,]|\s)\s*(\d{2})\s*[A-Za-z*]?\s*$/;
// Leading quantity: "2 x", "2 @", "2X", or a bare small integer + space.
const QTY = /^\s*(\d{1,2})\s*(?:x|@)\s*/i;
// Some UK receipts print an isolated VAT marker between the product and price.
// Tesseract commonly reads the asterisk as an X.
const VAT_MARKER = /\s+(?:x|\*)\s*$/i;
// Aldi prints a 5–7 digit item code before each name. OCR may add one or two
// stray marks from the paper edge before it ("Y 384145 NUTS MIXED").
const ITEM_CODE = /^\s*(?:\S{1,2}\s+)?\d{5,7}\s+(?=.*[a-z]{2})/i;
// A line with only a quantity and a unit price ("2 x 1.99"). Aldi prints it
// above the product line and Lidl below it; Tesseract often reads x as "xX".
const QTY_ONLY = /(?:^|[^\d])(\d{1,2})\s*[x×@]{1,2}\s*£?\s*(\d{1,3})[.,](\d{2})\s*$/i;
// A UK date on the receipt (dd/mm/yy or dd/mm/yyyy).
const DATE = /\b([0-3]?\d)[/.-]([01]?\d)[/.-](\d{2}|\d{4})\b/;

/** Alias key: lowercase, strip price/qty/vat noise and punctuation, collapse space. */
export function normalize(text: string): string {
  return text
    .replace(PRICE, "")
    .replace(ITEM_CODE, "")
    .replace(QTY, "")
    .replace(VAT_MARKER, "")
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
  // Quantity-only rows, by OCR line index, and the product row index of each
  // product line, so a quantity row can find its neighbour afterwards.
  const multiples: Array<{ at: number; quantity: number; unitPrice: number }> = [];
  const productAt = new Map<number, number>();
  ocr.lines.forEach((l, at) => {
    const raw = l.text.trim();
    if (!raw) return;
    if (SKIP.test(raw) || BAG.test(raw)) return;

    const multiple = QTY_ONLY.exec(raw);
    if (multiple && raw.slice(0, multiple.index).replace(/[^a-z]/gi, "").length < 2) {
      multiples.push({
        at,
        quantity: Number(multiple[1]),
        unitPrice: Number(`${multiple[2]}.${multiple[3]}`),
      });
      return;
    }

    const priceM = PRICE.exec(raw);
    const negative = priceM?.[1] === "-";
    const price = priceM ? Number(`${priceM[2]}.${priceM[3]}`) : null;
    // Drop discount lines (negative price) and lines with no price at all — the
    // latter are usually headers/addresses, not items.
    if (price == null || negative) return;

    const qtyM = QTY.exec(raw);
    const quantity = qtyM ? Math.max(1, Number(qtyM[1])) : 1;

    const name = normalize(raw);
    if (name.replace(/[0-9\s]/g, "").length < 2) return; // needs real letters

    productAt.set(at, lines.length);
    lines.push({
      rawText: raw,
      normalizedText: name,
      quantity,
      unitPrice: quantity > 1 && price != null ? Number((price / quantity).toFixed(2)) : price,
      lineTotal: price,
      confidence: l.confidence ?? null,
    });
  });

  // Give each "2 x 1.99" row to the neighbouring product whose total it
  // explains: the next line (Aldi) first, then the previous line (Lidl).
  for (const m of multiples) {
    for (const at of [m.at + 1, m.at - 1]) {
      const line = lines[productAt.get(at) ?? -1];
      if (!line || line.quantity > 1 || line.lineTotal == null) continue;
      if (Math.abs(m.quantity * m.unitPrice - line.lineTotal) > 0.011) continue;
      line.quantity = m.quantity;
      line.unitPrice = m.unitPrice;
      break;
    }
  }
  return { merchant: detectMerchant(ocr), purchasedAt: detectDate(ocr), lines };
}
