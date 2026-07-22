import { db } from "../db.js";
import { computeStatus, STATUS_SEVERITY, type DateType, type InventoryRow } from "@eatme/shared";
import { categoriesMap } from "./categories.js";

type Row = {
  lot_id: string;
  product_id: string;
  location_id: string;
  count: number;
  fraction_left: number;
  date_type: string | null;
  date_value: string | null;
  opened_at: string | null;
  open_life_days_override: number | null;
  purchased_at: string | null;
  name: string;
  brand: string | null;
  category_id: string;
  created_at: string;
};

// nulls sort last (an undated lot is never "sooner" than a dated one)
const sooner = (a: number | null, b: number | null) =>
  a == null ? false : b == null ? true : a < b;

/**
 * One aggregated row per product from its active stock lots. Each lot's freshness
 * is computed, then a single "governing" lot (worst status, ties broken by the
 * soonest date) supplies the row's status/date so the badge and date agree, while
 * counts are summed across lots.
 */
export function listInventory(
  opts: { q?: string; locationId?: string; includeArchived?: boolean },
  today: string,
): InventoryRow[] {
  const where: string[] = [];
  const vals: string[] = [];
  if (!opts.includeArchived) where.push("l.archived_at IS NULL");
  if (opts.q) {
    where.push("(p.name LIKE ? OR p.brand LIKE ?)");
    vals.push(`%${opts.q}%`, `%${opts.q}%`);
  }
  if (opts.locationId) {
    where.push("l.location_id = ?");
    vals.push(opts.locationId);
  }
  const rows = db
    .prepare(
      `SELECT l.id AS lot_id, l.product_id, l.location_id, l.count, l.fraction_left,
              l.date_type, l.date_value, l.opened_at, l.open_life_days_override,
              l.purchased_at, l.created_at,
              p.name, p.brand, p.category_id
       FROM stock_lots l JOIN products p ON p.id = l.product_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}`,
    )
    .all(...vals) as Row[];

  const cats = categoriesMap();
  type Acc = { row: InventoryRow; govSeverity: number; govDaysLeft: number | null; sole: number };
  const acc = new Map<string, Acc>();

  for (const r of rows) {
    const cat = cats.get(r.category_id);
    const s = computeStatus(
      {
        dateType: r.date_type as DateType | null,
        dateValue: r.date_value,
        openedAt: r.opened_at,
        openLifeDaysOverride: r.open_life_days_override,
      },
      cat
        ? { openLifeDays: cat.openLifeDays, warnDays: cat.warnDays }
        : { openLifeDays: null, warnDays: 14 },
      today,
    );
    const severity = STATUS_SEVERITY[s.status];

    let a = acc.get(r.product_id);
    if (!a) {
      a = {
        row: {
          productId: r.product_id,
          name: r.name,
          brand: r.brand,
          categoryId: r.category_id,
          locationId: r.location_id,
          lotCount: 0,
          totalCount: 0,
          fractionLeft: null,
          status: "ok",
          pressureDate: null,
          pressureKind: null,
          daysLeft: null,
          startDate: null,
          startKind: null,
          createdAt: r.created_at,
        },
        govSeverity: -1,
        govDaysLeft: null,
        sole: r.fraction_left,
      };
      acc.set(r.product_id, a);
    }
    a.row.lotCount += 1;
    a.row.totalCount += r.count;
    a.sole = r.fraction_left;
    if (r.created_at > a.row.createdAt) a.row.createdAt = r.created_at;

    if (
      severity > a.govSeverity ||
      (severity === a.govSeverity && sooner(s.daysLeft, a.govDaysLeft))
    ) {
      a.govSeverity = severity;
      a.govDaysLeft = s.daysLeft;
      a.row.status = s.status;
      a.row.pressureDate = s.pressureDate;
      a.row.pressureKind = s.pressureKind;
      a.row.daysLeft = s.daysLeft;
      a.row.locationId = r.location_id;
      // Start the timeline at the governing clock's origin: an open-life clock
      // begins when opened; a printed date's track begins when bought (or, as a
      // labelled fallback, when the pack was added to EatMe).
      if (s.pressureKind === "open_life" && r.opened_at) {
        a.row.startDate = r.opened_at;
        a.row.startKind = "opened";
      } else if (r.purchased_at) {
        a.row.startDate = r.purchased_at;
        a.row.startKind = "purchased";
      } else {
        a.row.startDate = r.created_at.slice(0, 10);
        a.row.startKind = "added";
      }
    }
  }

  return [...acc.values()].map((a) => {
    a.row.fractionLeft = a.row.lotCount === 1 ? a.sole : null;
    return a.row;
  });
}
