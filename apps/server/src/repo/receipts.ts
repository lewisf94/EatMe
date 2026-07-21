import { db } from "../db.js";
import { newId } from "@eatme/shared";

// --- purchases + lines -------------------------------------------------
export type PurchaseRow = {
  id: string;
  merchant: string | null;
  purchased_at: string | null;
  source: string | null;
  image_hash: string | null;
  status: string;
  created_at: string;
};

export type LineRow = {
  id: string;
  purchase_id: string;
  line_no: number;
  raw_text: string;
  normalized_text: string;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  extraction_confidence: number | null;
  matched_product_id: string | null;
  chosen_location_id: string | null;
  status: string;
  created_at: string;
};

export function createPurchase(p: {
  merchant: string | null;
  purchasedAt: string | null;
  source: string;
  imageHash: string | null;
}): PurchaseRow {
  const id = newId();
  db.prepare(
    "INSERT INTO purchases (id, merchant, purchased_at, source, image_hash, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
  ).run(id, p.merchant, p.purchasedAt, p.source, p.imageHash, new Date().toISOString());
  return getPurchase(id)!;
}

export function getPurchase(id: string): PurchaseRow | undefined {
  return db.prepare("SELECT * FROM purchases WHERE id = ?").get(id) as PurchaseRow | undefined;
}

export function setPurchaseStatus(id: string, status: string): void {
  db.prepare("UPDATE purchases SET status = ? WHERE id = ?").run(status, id);
}

export function addLine(line: {
  purchaseId: string;
  lineNo: number;
  rawText: string;
  normalizedText: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
  confidence: number | null;
  matchedProductId: string | null;
}): LineRow {
  const id = newId();
  db.prepare(
    `INSERT INTO purchase_lines
       (id, purchase_id, line_no, raw_text, normalized_text, quantity, unit_price, line_total,
        extraction_confidence, matched_product_id, chosen_location_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?)`,
  ).run(
    id,
    line.purchaseId,
    line.lineNo,
    line.rawText,
    line.normalizedText,
    line.quantity,
    line.unitPrice,
    line.lineTotal,
    line.confidence,
    line.matchedProductId,
    new Date().toISOString(),
  );
  return getLine(id)!;
}

export function getLine(id: string): LineRow | undefined {
  return db.prepare("SELECT * FROM purchase_lines WHERE id = ?").get(id) as LineRow | undefined;
}

export function linesFor(purchaseId: string): LineRow[] {
  return db
    .prepare("SELECT * FROM purchase_lines WHERE purchase_id = ? ORDER BY line_no")
    .all(purchaseId) as LineRow[];
}

export function setLineOutcome(
  id: string,
  status: string,
  productId: string | null,
  locationId: string | null,
): void {
  db.prepare(
    "UPDATE purchase_lines SET status = ?, matched_product_id = ?, chosen_location_id = ? WHERE id = ?",
  ).run(status, productId, locationId, id);
}

// --- aliases -----------------------------------------------------------
export type AliasRow = { retailer: string; normalized_text: string; product_id: string };

export function aliasesFor(retailer: string): AliasRow[] {
  return db
    .prepare("SELECT retailer, normalized_text, product_id FROM receipt_aliases WHERE retailer = ?")
    .all(retailer) as AliasRow[];
}

/** Learn (or reinforce) that a retailer's line text maps to a product. */
export function learnAlias(retailer: string, normalizedText: string, productId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO receipt_aliases (id, retailer, normalized_text, product_id, confirmed_count, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(retailer, normalized_text) DO UPDATE SET
       product_id = excluded.product_id,
       confirmed_count = confirmed_count + 1,
       last_seen_at = excluded.last_seen_at`,
  ).run(newId(), retailer, normalizedText, productId, now, now);
}
