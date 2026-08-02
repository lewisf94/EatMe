import { atomic, db } from "../db.js";

type BackupValue = string | number | null;
type BackupRow = Record<string, BackupValue>;
export type EatMeBackup = {
  format: "eatme-backup";
  version: 1;
  createdAt: string;
  tables: Record<string, BackupRow[]>;
};

// Explicit columns are both documentation and an injection boundary: an import
// can never choose a table or column name that reaches SQL.
const TABLE_COLUMNS = {
  locations: ["id", "name", "sort_order", "guidance_key"],
  categories: ["id", "name", "open_life_days", "warn_days", "guidance_key"],
  products: [
    "id",
    "name",
    "brand",
    "barcode",
    "category_id",
    "default_location_id",
    "package_quantity",
    "package_unit",
    "image_url",
    "created_at",
    "updated_at",
    "guidance_rule_id",
  ],
  stock_lots: [
    "id",
    "product_id",
    "location_id",
    "count",
    "fraction_left",
    "purchased_at",
    "date_type",
    "date_value",
    "opened_at",
    "open_life_days_override",
    "archived_at",
    "archive_reason",
    "source",
    "created_at",
    "updated_at",
    "date_estimated",
  ],
  containers: ["id", "qr_uid", "name", "product_id", "location_id", "current_stock_lot_id"],
  usage_events: ["id", "stock_lot_id", "event", "fraction_after", "reason", "at"],
  recipes: ["id", "name", "url", "notes", "created_at", "dietary_tags", "starter_key"],
  recipe_ingredients: ["id", "recipe_id", "match_text", "required"],
  shopping_list: ["id", "product_id", "name", "added_at", "done_at"],
  purchases: ["id", "merchant", "purchased_at", "source", "image_hash", "status", "created_at"],
  purchase_lines: [
    "id",
    "purchase_id",
    "line_no",
    "raw_text",
    "normalized_text",
    "quantity",
    "unit_price",
    "line_total",
    "extraction_confidence",
    "matched_product_id",
    "chosen_location_id",
    "status",
    "created_at",
  ],
  receipt_aliases: [
    "id",
    "retailer",
    "normalized_text",
    "product_id",
    "confirmed_count",
    "last_seen_at",
    "created_at",
  ],
  settings: ["key", "value"],
} as const;

const TABLES = Object.keys(TABLE_COLUMNS) as Array<keyof typeof TABLE_COLUMNS>;
const MAX_ROWS = 100_000;

export function createBackup(now = new Date()): EatMeBackup {
  const tables: Record<string, BackupRow[]> = {};
  for (const table of TABLES) {
    const columns = TABLE_COLUMNS[table];
    const rows = db.prepare(`SELECT ${columns.join(", ")} FROM ${table}`).all() as BackupRow[];
    // Device diagnostics are useful; credentials and push endpoints live
    // outside this table and are deliberately never exported.
    tables[table] = rows;
  }
  return { format: "eatme-backup", version: 1, createdAt: now.toISOString(), tables };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatedBackup(value: unknown): EatMeBackup {
  if (!isRecord(value) || value.format !== "eatme-backup" || value.version !== 1) {
    throw new Error("not a supported EatMe backup");
  }
  if (typeof value.createdAt !== "string" || !isRecord(value.tables)) {
    throw new Error("backup header is incomplete");
  }
  const supplied = Object.keys(value.tables);
  if (
    supplied.length !== TABLES.length ||
    supplied.some((table) => !TABLES.includes(table as never))
  ) {
    throw new Error("backup table set does not match this EatMe version");
  }

  let total = 0;
  const tables: Record<string, BackupRow[]> = {};
  for (const table of TABLES) {
    const rawRows = value.tables[table];
    if (!Array.isArray(rawRows)) throw new Error(`backup table ${table} is invalid`);
    total += rawRows.length;
    if (total > MAX_ROWS) throw new Error("backup contains too many rows");
    const expected = [...TABLE_COLUMNS[table]].sort();
    tables[table] = rawRows.map((raw) => {
      if (!isRecord(raw) || Object.keys(raw).sort().join("\0") !== expected.join("\0")) {
        throw new Error(`backup row in ${table} has unexpected columns`);
      }
      const row: BackupRow = {};
      for (const column of expected) {
        const cell = raw[column];
        if (
          cell !== null &&
          typeof cell !== "string" &&
          !(typeof cell === "number" && Number.isFinite(cell))
        ) {
          throw new Error(`backup value in ${table}.${column} is invalid`);
        }
        row[column] = cell as BackupValue;
      }
      return row;
    });
  }
  return {
    format: "eatme-backup",
    version: 1,
    createdAt: value.createdAt,
    tables,
  };
}

export function restoreBackup(value: unknown): { rows: number } {
  const backup = validatedBackup(value);
  return atomic(() => {
    for (const table of [...TABLES].reverse()) db.exec(`DELETE FROM ${table}`);
    let rows = 0;
    for (const table of TABLES) {
      const columns = TABLE_COLUMNS[table];
      const placeholders = columns.map(() => "?").join(", ");
      const insert = db.prepare(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
      );
      for (const row of backup.tables[table]) {
        insert.run(...columns.map((column) => row[column]));
        rows++;
      }
    }
    const broken = db.prepare("PRAGMA foreign_key_check").all();
    if (broken.length) throw new Error("backup contains broken relationships");
    return { rows };
  });
}

export function databaseIntegrity(): {
  ok: boolean;
  quickCheck: string;
  foreignKeyErrors: number;
} {
  const quick = db.prepare("PRAGMA quick_check").get() as Record<string, string>;
  const quickCheck = Object.values(quick)[0] ?? "unknown";
  const foreignKeyErrors = db.prepare("PRAGMA foreign_key_check").all().length;
  return { ok: quickCheck === "ok" && foreignKeyErrors === 0, quickCheck, foreignKeyErrors };
}
