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
  [/\bco[\s-]?op(?:erative)?\b/i, "Co-op"],
  [/marks\s*&?\s*spencer|m&s/i, "M&S"],
  [/iceland/i, "Iceland"],
];

const MERCHANT_SIGNS: Array<[RegExp, string]> = [
  [/clubcard/i, "Tesco"],
  [/\bnectar\b/i, "Sainsbury's"],
  [/asda\.com|asda rewards/i, "Asda"],
  [/more card/i, "Morrisons"],
  [/lidl plus/i, "Lidl"],
  [/mywaitrose/i, "Waitrose"],
  [/\bsparks\b/i, "M&S"],
];

// Lines that are never products: totals, tender, loyalty, tax, store/legal noise.
const SKIP =
  /\b(sub-?total|total|balance|change|cash|card|visa|mastercard|amex|contactless|tendered?|amount due|to pay|vat(?:\s|$|-)|vat\s*reg|clubcard|nectar|points?|saving[s]?|multibuy|offer|voucher|discount|reduced\s*price|reduction|markdown|receipt|thank\s*you|store\b|till\b|operator|cashier|www\.|http|reg(?:ister)?\b|tel[:\s]|phone|©|number of items|items? sold|order|barcode)\b/i;

// A carrier bag isn't food but does have a price — drop it explicitly.
const BAG = /\b(carrier\s*bag|bag\s*for\s*life|\bbag\b(?!el))/i;

// Trailing price like "£1.29", "1,29", "1 29 A" (OCR split), or "-0.50". A
// minus sign counts only next to the price: "Slices - £2.60" is not a discount.
// Some tills print the minus sign of a discount after the amount ("£0.50-").
const PRICE = /(-?)£?\s*(\d{1,3})\s*(?:[.,]|\s)\s*(\d{2})\s*(-)?\s*[A-Za-z*]?\s*$/;
// Leading quantity: "2 x", "2 @", "2X", or a bare small integer + space.
const QTY = /^\s*(\d{1,2})\s*(?:x|@)\s*/i;
// Some UK receipts print an isolated VAT marker between the product and price.
// Tesseract commonly reads the asterisk as an X.
const VAT_MARKER = /\s+(?:x|\*)\s*$/i;
// Aldi prints a 5–7 digit item code before each name. OCR may add one or two
// stray marks from the paper edge before it ("Y 384145 NUTS MIXED").
const ITEM_CODE = /^\s*(?:\S{1,2}\s+)?\d{5,7}\s+(?=.*[a-z]{2})/i;
// A line with only a quantity and a unit price ("2 x 1.99"). Aldi prints it
// above the product line and Lidl below it; Tesseract often reads x as "xX",
// or ”, and the leading 0 of the price as O or Q.
const QTY_ONLY = /(?:^|[^\d])(\d{1,2})\s*[x×@”"]{1,2}\s*£?\s*([0-9OQ]{1,3})[.,](\d{2})\s*$/i;
// A line with only a unit price ("0.39"), when OCR lost the "2 x" before it.
// Tesseract can read the leading 0 as O or Q.
const UNIT_ONLY = /^[^a-z0-9]*([0-9OQ]{1,3})[.,](\d{2})\s*$/i;
// A loose item sold by weight ("0.842 kg @ £0.95/kg"). Most supermarkets
// print the name on one row and the weight, with the price, on the next row.
// OCR can read the leading 0 as @ or O ("@.512 kg").
const WEIGHT = /^\W*[\dOQ]{0,2}\s*[.,]\s*\d{1,3}\s*kg\b/i;
// A quantity row that also has the line total ("3 @ £0.45   £1.35").
const QTY_TOTAL =
  /^\W*(\d{1,2})\s*[x×@]\s*£?\s*(\d{1,3})[.,](\d{2})\s+£?\s*(\d{1,3})[.,](\d{2})\s*[a-z*]?\s*$/i;
// "Total" is also a yoghurt brand ("FAGE TOTAL 5% YOGURT").
const TOTAL_BRAND = /\bfage\b|\btotal\s*\d{1,2}\s*%/i;
// A UK date on the receipt (dd/mm/yy or dd/mm/yyyy).
const DATE = /\b([0-3]?\d)[/.-]([01]?\d)[/.-](\d{4}|\d{2})\b/;

// Tesco prints a quantity column before each name ("2 Tesco Angel Cake £2.60")
// and continues a long name on the next rows without a price.
const LEAD_QTY = /^\s*(\d{1,2})\s+(?=[a-z]{3})/i;
// Clubcard price rows ("Cc £3.00 -£0.35"). OCR reads Cc as Co.
const CLUBCARD = /^\s*c[co]\s+-?£?\s*\d/i;
// A unit price row under a multiple ("£1.30 each").
const EACH = /^\W*£?\s*(\d{1,3})[.,](\d{2})\s*each\b/i;
// A row that is only a price ("£4.00"), when OCR put the price on its own row.
const PRICE_ONLY = /^[^a-z0-9]*£?\s*(\d{1,3})[.,](\d{2})\s*[^a-z0-9]*$/i;
// Rows in a long name that are not part of the name.
const NOT_NAME = /^\s*price\s*marked/i;
// The end of the product rows.
const END = /\b(sub-?total|total|balance|amount due|to pay)\b/i;

// OCR marks after a price ("1.25 ||", "3.50 | i}") hide the price. Marks
// before the text ("| Co £2.45") hide what the row starts with.
const TRAILING_MARKS = /(\d[.,]\d{2})(?:\s+(?:[^a-z0-9\s]{1,3}|[a-z][^a-z0-9\s]{0,2}))+\s*$/i;
const LEADING_MARKS = /^(?:[^a-z0-9£€\s-]{1,3}\s+)+/i;
// A mark that touches the price ("£0.41]").
const TOUCHING_MARKS = /(\d[.,]\d{2})[\][|(){}!:;'"`.,_~]+\s*$/;
const clean = (text: string) =>
  text
    .trim()
    .replace(TRAILING_MARKS, "$1")
    .replace(TOUCHING_MARKS, "$1")
    .replace(LEADING_MARKS, "");

/** Alias key: lowercase, strip price/qty/vat noise and punctuation, collapse space. */
export function normalize(text: string): string {
  return (
    text
      .replace(PRICE, "")
      .replace(ITEM_CODE, "")
      .replace(QTY, "")
      .replace(VAT_MARKER, "")
      // OCR reads O as 0 inside a word ("OX0 CUBES"). A 0 after two letters,
      // at the end of the word or before another letter, is an O.
      .replace(/(?<=[a-z]{2})0(?=[a-z]|\b)/gi, "o")
      .replace(/[^a-z0-9]+/gi, " ")
      .trim()
      .toLowerCase()
  );
}

function detectMerchant(ocr: OcrResult): string | null {
  if (ocr.merchant) return ocr.merchant;
  const head = ocr.lines
    .slice(0, 6)
    .map((l) => l.text)
    .join(" ");
  for (const [re, name] of MERCHANTS) if (re.test(head)) return name;
  // The shop name at the top can be unreadable. The shop's own words lower
  // on the receipt (its loyalty scheme, its web address) also name it.
  const all = ocr.lines.map((l) => l.text).join("\n");
  for (const [re, name] of [...MERCHANT_SIGNS, ...MERCHANTS]) if (re.test(all)) return name;
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

type Block = {
  quantity: number;
  parts: string[];
  price: number | null;
  unitPrice: number | null;
  /** The price came on a continuation row, so the name is complete. */
  closed: boolean;
  confidence: number | null;
  /** The OCR row that gave the price. */
  priceAt: number;
};

const words = (s: string) => (s.match(/[a-z]{3,}/gi) ?? []).length;

/**
 * Parse a receipt with a quantity column (Tesco). Each product starts at a row
 * with a leading quantity and takes up to three name rows after it. A Clubcard
 * row or a total ends a product. A price on a row of its own goes to the
 * nearest product without a price. Gives null when the receipt has no
 * quantity column.
 */
function parseQuantityColumn(
  ocr: OcrResult,
  priceRows: Map<ParsedLine, number>,
): ParsedLine[] | null {
  const texts = ocr.lines.map((l) => clean(l.text));
  const starts = texts.filter((t) => LEAD_QTY.test(t) && PRICE.test(t)).length;
  if (starts < 3) return null;

  const blocks: Block[] = [];
  // Lone prices, by the block count when they were seen.
  const lone: Array<{ after: number; price: number }> = [];
  let open: Block | null = null;
  let row = -1;
  const begin = (quantity: number, text: string, confidence: number | null) => {
    open = {
      quantity,
      parts: [],
      price: null,
      unitPrice: null,
      closed: false,
      confidence,
      priceAt: -1,
    };
    blocks.push(open);
    addRow(open, text, true);
  };
  const addRow = (b: Block, text: string, first: boolean) => {
    const m = PRICE.exec(text);
    if (m && m[1] !== "-" && b.price == null) {
      b.price = Number(`${m[2]}.${m[3]}`);
      b.priceAt = row;
      if (!first) b.closed = true;
    }
    const name = normalize(first ? text.replace(LEAD_QTY, "") : text);
    if (/[a-z]/.test(name)) b.parts.push(name);
  };

  for (const [at, text] of texts.entries()) {
    row = at;
    if (!text) continue;
    if (END.test(text)) break;
    const confidence = ocr.lines[at].confidence ?? null;
    const qty = LEAD_QTY.exec(text);
    if (qty && !BAG.test(text)) {
      begin(Math.max(1, Number(qty[1])), text, confidence);
      continue;
    }
    if (CLUBCARD.test(text) || SKIP.test(text) || BAG.test(text)) {
      open = null;
      continue;
    }
    const each = EACH.exec(text);
    if (each) {
      if (open) (open as Block).unitPrice = Number(`${each[1]}.${each[2]}`);
      // A curved row can put the next product's price on the same row
      // ("£1.30 each £4.00").
      const rest = PRICE.exec(text.slice(each[0].length));
      if (rest && rest[1] !== "-") {
        lone.push({ after: blocks.length, price: Number(`${rest[2]}.${rest[3]}`) });
      }
      continue;
    }
    const only = PRICE_ONLY.exec(text);
    if (only) {
      const price = Number(`${only[1]}.${only[2]}`);
      if (open && !(open as Block).closed && (open as Block).price == null) {
        (open as Block).price = price;
      } else lone.push({ after: blocks.length, price });
      continue;
    }
    // A row needs two letters, a size ("340g") or a price ("6x £1.10" ends a
    // long name). Lone marks ("|", "i") are noise.
    const nameLike = /[a-z].*[a-z]|\d[a-z]/i.test(text);
    if (NOT_NAME.test(text) || (!nameLike && !PRICE.test(text))) continue;
    const b = open as Block | null;
    // A second priced row is the next product, when its leading quantity was
    // lost ("Tesco Ready Salted Crisps £1.10").
    const priced = PRICE.exec(text);
    if (b && b.price != null && priced && priced[1] !== "-") {
      if (words(text) >= 2) begin(1, text, confidence);
      else lone.push({ after: blocks.length, price: Number(`${priced[2]}.${priced[3]}`) });
      continue;
    }
    if (b && !b.closed && b.parts.length < 4) addRow(b, text, false);
    else if (blocks.length && words(text) >= 2) begin(1, text, confidence);
  }

  // A lone price goes to the next product without a price, else the last one.
  for (const { after, price } of lone) {
    const target =
      blocks.slice(after).find((b) => b.price == null) ??
      blocks
        .slice(0, after)
        .reverse()
        .find((b) => b.price == null);
    if (target) target.price = price;
  }

  return blocks
    .filter((b) => b.parts.join("").replace(/[0-9\s]/g, "").length >= 2)
    .map((b) => {
      const line = toLine(b);
      if (b.priceAt >= 0) priceRows.set(line, b.priceAt);
      return line;
    });
}

function toLine(b: Block): ParsedLine {
  const total = b.price;
  let unit = b.unitPrice;
  if (unit != null && total != null && Math.abs(unit * b.quantity - total) > 0.011) unit = null;
  return {
    rawText: b.parts.join(" "),
    normalizedText: b.parts.join(" "),
    quantity: b.quantity,
    unitPrice:
      unit ?? (total != null && b.quantity > 1 ? Number((total / b.quantity).toFixed(2)) : total),
    lineTotal: total,
    confidence: b.confidence,
  };
}

const TOTAL = /^(?!.*sub-?\s*total).*\b(total|balance|amount due|to pay)\b/i;

/**
 * Check the lines against the receipt total. When they do not add up, and one
 * other OCR reading of one price makes them add up, use that reading. OCR
 * often misreads one digit ("1.06" for "1.00") in only some of its passes.
 */
function matchTotal(
  ocr: OcrResult,
  lines: ParsedLine[],
  priceRows: Map<ParsedLine, number>,
  discounts = 0,
) {
  const totalRow = ocr.lines.find(
    (l) => TOTAL.test(l.text) && !TOTAL_BRAND.test(l.text) && PRICE.test(clean(l.text)),
  );
  if (!totalRow) return;
  const read = (t: string) => {
    const m = PRICE.exec(t);
    return m && m[1] !== "-" ? Number(`${m[2]}.${m[3]}`) : null;
  };
  // The receipt total is the sum of the lines less the discount rows.
  const totals = [read(clean(totalRow.text)), ...(totalRow.priceAlternatives ?? []).map(read)]
    .filter((t): t is number => t != null)
    .flatMap((t) => (discounts > 0 ? [t + discounts, t] : [t]));
  const sum = lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0);
  const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
  if (totals.some((t) => near(sum, t))) return;
  for (const total of totals) {
    for (const line of lines) {
      const at = priceRows.get(line);
      if (at == null || line.lineTotal == null) continue;
      for (const alt of ocr.lines[at].priceAlternatives ?? []) {
        const price = read(alt);
        if (price == null || !near(sum - line.lineTotal + price, total)) continue;
        line.unitPrice = line.quantity > 1 ? Number((price / line.quantity).toFixed(2)) : price;
        line.lineTotal = price;
        return;
      }
    }
  }
}

/**
 * Turn raw OCR lines into candidate product lines: keep lines with a name and a
 * (positive) price, dropping totals/tender/loyalty/store noise, carrier bags and
 * discounts. Pure — the same OCR always yields the same lines (unit-tested).
 */
export function parseReceipt(ocr: OcrResult): ParsedReceipt {
  const priceRows = new Map<ParsedLine, number>();
  const column = parseQuantityColumn(ocr, priceRows);
  if (column) {
    matchTotal(ocr, column, priceRows);
    return { merchant: detectMerchant(ocr), purchasedAt: detectDate(ocr), lines: column };
  }
  const lines: ParsedLine[] = [];
  // Quantity-only rows, by OCR line index, and the product row index of each
  // product line, so a quantity row can find its neighbour afterwards.
  const multiples: Array<{ at: number; quantity: number; unitPrice: number }> = [];
  const productAt = new Map<number, number>();
  const texts = ocr.lines.map((l) => clean(l.text));
  const priceOf = (text: string | undefined) => {
    const m = text ? PRICE.exec(text) : null;
    if (!m) return null;
    return { value: Number(`${m[2]}.${m[3]}`), negative: m[1] === "-" || m[4] === "-" };
  };
  const add = (at: number, raw: string, name: string, quantity: number, price: number) => {
    productAt.set(at, lines.length);
    lines.push({
      rawText: raw,
      normalizedText: name,
      quantity,
      unitPrice: quantity > 1 ? Number((price / quantity).toFixed(2)) : price,
      lineTotal: price,
      confidence: ocr.lines[at].confidence ?? null,
    });
  };
  // A row with a name and no price, directly before the current row. Its
  // price can be on the next row, with a weight or a quantity.
  let pending: { raw: string; name: string } | null = null;
  let discounts = 0;
  for (const [at, raw] of texts.entries()) {
    const named = pending;
    pending = null;
    if (!raw) continue;
    const brand = TOTAL_BRAND.test(raw);
    // Rows after the total are payment and VAT rows ("A 0% VAT 15.64").
    if (END.test(raw) && !brand && PRICE.test(raw) && lines.length) break;
    if ((SKIP.test(raw) && !brand) || BAG.test(raw)) {
      const saving = priceOf(raw);
      if (saving?.negative) discounts += saving.value;
      continue;
    }
    const priced = priceOf(raw);

    if (WEIGHT.test(raw)) {
      if (named && priced && !priced.negative) {
        add(at, `${named.raw} ${raw}`, named.name, 1, priced.value);
      }
      continue;
    }

    const withTotal = QTY_TOTAL.exec(raw);
    if (withTotal) {
      const quantity = Number(withTotal[1]);
      const unitPrice = Number(`${withTotal[2]}.${withTotal[3]}`);
      const total = Number(`${withTotal[4]}.${withTotal[5]}`);
      if (quantity >= 1 && Math.abs(quantity * unitPrice - total) < 0.011) {
        if (named) {
          add(at, `${named.raw} ${raw}`, named.name, quantity, total);
          lines[lines.length - 1].unitPrice = unitPrice;
        } else multiples.push({ at, quantity, unitPrice });
        continue;
      }
    }

    // A neighbouring product row with this total explains a quantity row.
    const explains = (total: number) =>
      [texts[at + 1], texts[at - 1]].some((t) => {
        const p = priceOf(t);
        return p != null && !p.negative && Math.abs(p.value - total) < 0.011;
      });

    const multiple = QTY_ONLY.exec(raw);
    // OCR can add a short stray mark before the quantity ("ge 2x 0.65"). A
    // word of three or more letters means the row is a product, not a quantity.
    if (multiple && !/[a-z]{3}/i.test(raw.slice(0, multiple.index))) {
      const quantity = Number(multiple[1]);
      const unitPrice = Number(`${Number(multiple[2].replace(/[OQ]/gi, "0"))}.${multiple[3]}`);
      // "LEMONS" then "3 @ £0.35": the row gives the price of the name above.
      if (named && quantity >= 1 && !explains(quantity * unitPrice)) {
        add(
          at,
          `${named.raw} ${raw}`,
          named.name,
          quantity,
          Number((quantity * unitPrice).toFixed(2)),
        );
        lines[lines.length - 1].unitPrice = unitPrice;
      } else multiples.push({ at, quantity, unitPrice });
      continue;
    }

    // The quantity is worked out later from the neighbouring product's total.
    const unit = UNIT_ONLY.exec(raw);
    if (unit) {
      const price = Number(`${Number(unit[1].replace(/[OQ]/gi, "0"))}.${unit[2]}`);
      const next = priceOf(texts[at + 1]);
      const times = next && price > 0 ? next.value / price : 0;
      const isUnit = times > 1.99 && times < 20.01 && Math.abs(times - Math.round(times)) < 0.02;
      // A name row and then a price row: the price belongs to the name.
      if (named && !isUnit) add(at, `${named.raw} ${raw}`, named.name, 1, price);
      else multiples.push({ at, quantity: 0, unitPrice: price });
      continue;
    }

    if (!priced) {
      // Maybe the name of a product whose price is on the next row.
      const name = normalize(raw);
      if (/[a-z]{3}/.test(name) && !DATE.test(raw)) pending = { raw, name };
      continue;
    }
    if (priced.negative) {
      discounts += priced.value;
      continue;
    }

    const qtyM = QTY.exec(raw);
    const quantity = qtyM ? Math.max(1, Number(qtyM[1])) : 1;

    const name = normalize(raw);
    if (name.replace(/[0-9\s]/g, "").length < 2) continue; // needs real letters
    add(at, raw, name, quantity, priced.value);
  }

  // A receipt total in a spaced-out font ("T o t a l") can fail the SKIP
  // check. Drop a line with no word of four letters ("Toa t a 1") whose price
  // is the sum of all the lines before it.
  let running = 0;
  for (const [at, index] of [...productAt]) {
    const line = lines[index];
    const noWord = !/[a-z]{4}/.test(line.normalizedText);
    if (index >= 2 && noWord && Math.abs((line.lineTotal ?? 0) - running) < 0.005) {
      productAt.delete(at);
      lines.splice(index, 1);
      for (const [other, i] of productAt) if (i > index) productAt.set(other, i - 1);
      break;
    }
    running += line.lineTotal ?? 0;
  }

  // Give each "2 x 1.99" row to the neighbouring product whose total it
  // explains: the next product (Aldi) first, then the previous one (Lidl).
  // Stray marks between the rows ("3", ":") do not count as rows. A lone
  // unit price gives the quantity only when the total is 2 to 20 times it.
  const rows = [...new Set([...productAt.keys(), ...multiples.map((m) => m.at)])].sort(
    (a, b) => a - b,
  );
  for (const m of multiples) {
    const here = rows.indexOf(m.at);
    for (const at of [rows[here + 1], rows[here - 1]]) {
      const line = lines[productAt.get(at) ?? -1];
      if (!line || line.quantity > 1 || line.lineTotal == null || m.unitPrice <= 0) continue;
      const quantity = m.quantity || Math.round(line.lineTotal / m.unitPrice);
      if (quantity < 2 || quantity > 20) continue;
      if (Math.abs(quantity * m.unitPrice - line.lineTotal) > 0.011) continue;
      line.quantity = quantity;
      line.unitPrice = m.unitPrice;
      break;
    }
  }
  for (const [at, index] of productAt) priceRows.set(lines[index], at);
  matchTotal(ocr, lines, priceRows, discounts);
  return { merchant: detectMerchant(ocr), purchasedAt: detectDate(ocr), lines };
}
