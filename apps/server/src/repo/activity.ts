import { db } from "../db.js";
import type { ActivityEntry, ProductWasteStat, UsageInsights } from "@eatme/shared";

type ActivityRow = {
  id: string;
  event: string;
  fraction_after: number | null;
  reason: string | null;
  at: string;
  lot_id: string;
  product_id: string;
  product_name: string;
  can_restore: number;
};

export function listActivity(limit = 50): ActivityEntry[] {
  return (
    db
      .prepare(
        `SELECT e.id, e.event, e.fraction_after, e.reason, e.at,
                l.id AS lot_id, p.id AS product_id, p.name AS product_name,
                CASE WHEN e.event = 'archived' AND l.archived_at IS NOT NULL THEN 1 ELSE 0 END AS can_restore
         FROM usage_events e
         JOIN stock_lots l ON l.id = e.stock_lot_id
         JOIN products p ON p.id = l.product_id
         ORDER BY e.at DESC, e.rowid DESC
         LIMIT ?`,
      )
      .all(limit) as ActivityRow[]
  ).map((row) => ({
    id: row.id,
    event: row.event,
    fractionAfter: row.fraction_after,
    reason: row.reason,
    at: row.at,
    lotId: row.lot_id,
    productId: row.product_id,
    productName: row.product_name,
    canRestore: row.can_restore === 1,
  }));
}

type InsightRow = {
  product_id: string;
  name: string;
  binned: number;
  finished: number;
  average_price: number | null;
  binned_value: number | null;
  finished_value: number | null;
};

/** Usage statistics are calculated from durable archive state, not inferred
 * from the current inventory. Receipt prices are optional; value estimates are
 * null until at least one matched receipt supplies a price for the product. */
export function usageInsights(days = 90, now = new Date()): UsageInsights {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const rows = db
    .prepare(
      `WITH priced AS (
         SELECT matched_product_id AS product_id,
                AVG(CASE
                  WHEN unit_price > 0 THEN unit_price
                  WHEN line_total > 0 AND quantity > 0 THEN line_total / quantity
                END) AS average_price
         FROM purchase_lines
         WHERE matched_product_id IS NOT NULL AND status = 'added'
         GROUP BY matched_product_id
       )
       SELECT p.id AS product_id, p.name,
              SUM(CASE WHEN l.archive_reason = 'binned' THEN l.count ELSE 0 END) AS binned,
              SUM(CASE WHEN l.archive_reason = 'finished' THEN l.count ELSE 0 END) AS finished,
              priced.average_price,
              SUM(CASE WHEN l.archive_reason = 'binned' AND priced.average_price IS NOT NULL
                       THEN l.count * l.fraction_left * priced.average_price END) AS binned_value,
              SUM(CASE WHEN l.archive_reason = 'finished' AND priced.average_price IS NOT NULL
                       THEN l.count * priced.average_price END) AS finished_value
       FROM stock_lots l
       JOIN products p ON p.id = l.product_id
       LEFT JOIN priced ON priced.product_id = p.id
       WHERE l.archived_at >= ? AND l.archive_reason IN ('finished', 'binned')
       GROUP BY p.id, p.name, priced.average_price
       ORDER BY binned DESC, finished DESC, p.name`,
    )
    .all(since) as InsightRow[];

  const products: ProductWasteStat[] = rows.map((row) => ({
    productId: row.product_id,
    name: row.name,
    binned: Number(row.binned),
    finished: Number(row.finished),
  }));
  const pricedUsed = rows.filter((row) => row.finished_value != null);
  const pricedWaste = rows.filter((row) => row.binned_value != null);
  const cooked = db
    .prepare("SELECT COUNT(*) AS count FROM usage_events WHERE event = 'cooked' AND at >= ?")
    .get(since) as { count: number };

  return {
    days,
    finished: products.reduce((sum, item) => sum + item.finished, 0),
    binned: products.reduce((sum, item) => sum + item.binned, 0),
    cooked: Number(cooked.count),
    estimatedValueUsed: pricedUsed.length
      ? pricedUsed.reduce((sum, row) => sum + Number(row.finished_value), 0)
      : null,
    estimatedValueWasted: pricedWaste.length
      ? pricedWaste.reduce((sum, row) => sum + Number(row.binned_value), 0)
      : null,
    products,
  };
}
