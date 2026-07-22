import { db } from "../db.js";
import { newId, type StockLot, type StockLotInput, type StockLotPatch } from "@eatme/shared";

const COLS =
  "id, product_id, location_id, count, fraction_left, purchased_at, date_type, date_value, opened_at, open_life_days_override, archived_at, archive_reason, source, created_at, updated_at";

type LotRow = {
  id: string;
  product_id: string;
  location_id: string;
  count: number;
  fraction_left: number;
  purchased_at: string | null;
  date_type: string | null;
  date_value: string | null;
  opened_at: string | null;
  open_life_days_override: number | null;
  archived_at: string | null;
  archive_reason: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

function toLot(r: LotRow): StockLot {
  return {
    id: r.id,
    productId: r.product_id,
    locationId: r.location_id,
    count: r.count,
    fractionLeft: r.fraction_left,
    dateType: (r.date_type as StockLot["dateType"]) ?? null,
    dateValue: r.date_value,
    openedAt: r.opened_at,
    openLifeDaysOverride: r.open_life_days_override,
    purchasedAt: r.purchased_at,
    archivedAt: r.archived_at,
    archiveReason: r.archive_reason,
    source: r.source,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const byIdStmt = db.prepare(`SELECT ${COLS} FROM stock_lots WHERE id = ?`);
const insertStmt = db.prepare(
  `INSERT INTO stock_lots (${COLS})
   VALUES (@id,@productId,@locationId,@count,@fractionLeft,@purchasedAt,@dateType,@dateValue,@openedAt,@openLifeDaysOverride,NULL,NULL,@source,@createdAt,@updatedAt)`,
);
const logStmt = db.prepare(
  "INSERT INTO usage_events (id, stock_lot_id, event, fraction_after, reason, at) VALUES (?, ?, ?, ?, ?, ?)",
);

export function logEvent(
  stockLotId: string,
  event: string,
  fractionAfter: number | null = null,
  reason: string | null = null,
): void {
  logStmt.run(newId(), stockLotId, event, fractionAfter, reason, new Date().toISOString());
}

export function getLot(id: string): StockLot | undefined {
  const r = byIdStmt.get(id) as LotRow | undefined;
  return r ? toLot(r) : undefined;
}

export function lotsForProduct(productId: string, includeArchived = false): StockLot[] {
  const sql = `SELECT ${COLS} FROM stock_lots WHERE product_id = ?${
    includeArchived ? "" : " AND archived_at IS NULL"
  } ORDER BY created_at`;
  return (db.prepare(sql).all(productId) as LotRow[]).map(toLot);
}

export function createLot(input: StockLotInput): StockLot {
  const now = new Date().toISOString();
  const id = newId();
  insertStmt.run({
    id,
    productId: input.productId,
    locationId: input.locationId,
    count: input.count,
    fractionLeft: input.fractionLeft,
    purchasedAt: input.purchasedAt ?? null,
    // A printed date with no explicit type is treated as best-before (the safe,
    // non-alarming default); a use-by must be stated deliberately.
    dateType: input.dateValue ? (input.dateType ?? "best_before") : null,
    dateValue: input.dateValue ?? null,
    openedAt: input.openedAt ?? null,
    openLifeDaysOverride: input.openLifeDaysOverride ?? null,
    source: input.source ?? "manual",
    createdAt: now,
    updatedAt: now,
  });
  logEvent(id, "added", input.fractionLeft);
  return getLot(id) as StockLot;
}

const PATCH_COLS: Record<string, string> = {
  locationId: "location_id",
  count: "count",
  fractionLeft: "fraction_left",
  dateType: "date_type",
  dateValue: "date_value",
  openedAt: "opened_at",
  openLifeDaysOverride: "open_life_days_override",
};

export function updateLot(id: string, patch: StockLotPatch): StockLot | undefined {
  // Detect a first-open so we can record an "opened" event alongside the change.
  const opening = patch.openedAt != null;
  const wasOpen = opening ? getLot(id)?.openedAt : null;

  const sets: string[] = [];
  const vals: Array<string | number | null> = [];
  const p = patch as Record<string, unknown>;
  for (const [key, col] of Object.entries(PATCH_COLS)) {
    if (p[key] === undefined) continue;
    sets.push(`${col} = ?`);
    vals.push((p[key] as string | number | null) ?? null);
  }
  // Clearing the date also clears its type; setting a date without a type defaults it.
  if (p.dateValue !== undefined && p.dateType === undefined) {
    sets.push("date_type = ?");
    vals.push(p.dateValue ? "best_before" : null);
  }
  if (sets.length === 0) return getLot(id);
  sets.push("updated_at = ?");
  vals.push(new Date().toISOString(), id);
  const info = db.prepare(`UPDATE stock_lots SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  if (!info.changes) return undefined;
  // First time this lot is marked opened → log it so history/stats are complete.
  if (opening && !wasOpen) logEvent(id, "opened");
  return getLot(id);
}

export function archiveLot(id: string, reason: string): StockLot | undefined {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      "UPDATE stock_lots SET archived_at = ?, archive_reason = ?, updated_at = ? WHERE id = ?",
    )
    .run(now, reason, now, id);
  if (!info.changes) return undefined;
  logEvent(id, "archived", null, reason);
  return getLot(id);
}

export function addEvent(
  id: string,
  event: string,
  fractionAfter: number | null,
): StockLot | undefined {
  if (!getLot(id)) return undefined;
  if (fractionAfter != null) {
    const now = new Date().toISOString();
    db.prepare("UPDATE stock_lots SET fraction_left = ?, updated_at = ? WHERE id = ?").run(
      fractionAfter,
      now,
      id,
    );
  }
  logEvent(id, event, fractionAfter);
  return getLot(id);
}
