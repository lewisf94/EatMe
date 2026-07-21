import { describe, it, expect, beforeAll } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MIG = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const sql = (f: string) => readFileSync(join(MIG, f), "utf8");

// A standalone in-memory DB brought up to the P1/H schema, so we can exercise the
// 003 data-model migration on realistic rows without touching the app's db.ts.
function p1Db(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(sql("001_init.sql"));
  db.exec(sql("002_settings_and_reason.sql"));
  return db;
}

describe("003 data-model migration", () => {
  const db = p1Db();
  const one = <T>(q: string, ...a: unknown[]): T => db.prepare(q).get(...a) as T;
  const n = (q: string, ...a: unknown[]) => one<{ n: number }>(q, ...a).n;

  beforeAll(() => {
    db.exec(`INSERT INTO categories (id,name,open_life_days,warn_days,hard_expiry) VALUES
      ('c1','Tins',NULL,14,0), ('c2','Ground spices',270,30,0)`);
    db.exec(
      `INSERT INTO locations (id,name,sort_order) VALUES ('l1','Cupboard',0),('l2','Spice rack',1)`,
    );

    // it1 + it2: same barcode → must collapse to ONE product; it3 undated opened
    // spice; it4 archived (reason lives in usage_log).
    const ins = db.prepare(
      `INSERT INTO items
       (id,name,brand,barcode,category_id,location_id,photo_url,notes,quantity_total,unit,
        fraction_left,best_before,opened_at,open_life_days,qr_uid,archived_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,NULL,NULL,?,?,?,?,?,?,?,?,?,?)`,
    );
    ins.run("it1", "Chickpeas", "Tesco", "111", "c1", "l1", 400, "g", 1, "2026-09-14", null, null, "qr1", null, "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z"); // prettier-ignore
    ins.run("it2", "Chickpeas", "Tesco", "111", "c1", "l1", 400, "g", 0.5, "2026-10-01", null, null, "qr2", null, "2026-07-02T00:00:00Z", "2026-07-02T00:00:00Z"); // prettier-ignore
    ins.run("it3", "Cumin", null, null, "c2", "l2", null, null, 0.75, null, "2026-01-01", 270, "qr3", null, "2026-06-01T00:00:00Z", "2026-06-01T00:00:00Z"); // prettier-ignore
    ins.run("it4", "Old Jam", "X", null, "c1", "l1", null, null, 0, null, null, null, "qr4", "2026-05-01T00:00:00Z", "2026-04-01T00:00:00Z", "2026-05-01T00:00:00Z"); // prettier-ignore

    const log = db.prepare(
      "INSERT INTO usage_log (id,item_id,event,fraction_after,reason,at) VALUES (?,?,?,?,?,?)",
    );
    log.run("u1", "it1", "added", 1, null, "2026-07-01T00:00:00Z");
    log.run("u2", "it4", "archived", null, "finished", "2026-05-01T00:00:00Z");
    log.run("u3", "it3", "fraction_changed", 0.75, null, "2026-06-10T00:00:00Z");

    db.exec(sql("003_data_model.sql"));
  });

  it("dedupes to one product per identity (barcode collapses it1+it2)", () => {
    expect(n("SELECT COUNT(*) n FROM products")).toBe(3);
    const cp = one<{ id: string; name: string; brand: string }>(
      "SELECT id,name,brand FROM products WHERE barcode='111'",
    );
    expect(cp.name).toBe("Chickpeas");
    expect(cp.brand).toBe("Tesco");
    expect(cp.id).toBe("it1"); // MIN(id) of the group
  });

  it("creates one stock lot per item with typed dates + carried overrides/archive", () => {
    expect(n("SELECT COUNT(*) n FROM stock_lots")).toBe(4);
    expect(n("SELECT COUNT(*) n FROM stock_lots WHERE source='migrated'")).toBe(4);

    const lot1 = one<{ date_type: string; date_value: string; product_id: string }>(
      "SELECT date_type,date_value,product_id FROM stock_lots WHERE id='it1'",
    );
    expect(lot1).toMatchObject({ date_type: "best_before", date_value: "2026-09-14", product_id: "it1" }); // prettier-ignore
    expect(one<{ product_id: string }>("SELECT product_id FROM stock_lots WHERE id='it2'").product_id).toBe("it1"); // prettier-ignore

    const lot3 = one<{
      date_type: string | null;
      open_life_days_override: number;
      opened_at: string;
    }>("SELECT date_type,open_life_days_override,opened_at FROM stock_lots WHERE id='it3'");
    expect(lot3.date_type).toBeNull();
    expect(lot3.open_life_days_override).toBe(270);
    expect(lot3.opened_at).toBe("2026-01-01");

    const lot4 = one<{ archived_at: string; archive_reason: string }>(
      "SELECT archived_at,archive_reason FROM stock_lots WHERE id='it4'",
    );
    expect(lot4.archived_at).toBe("2026-05-01T00:00:00Z");
    expect(lot4.archive_reason).toBe("finished");
  });

  it("keeps QR continuity: every old qr_uid resolves to a container → live lot", () => {
    expect(n("SELECT COUNT(*) n FROM containers")).toBe(4);
    for (const qr of ["qr1", "qr2", "qr3", "qr4"]) {
      const c = one<{ current_stock_lot_id: string } | undefined>(
        "SELECT current_stock_lot_id FROM containers WHERE qr_uid=?",
        qr,
      );
      expect(c).toBeTruthy();
      expect(n("SELECT COUNT(*) n FROM stock_lots WHERE id=?", c!.current_stock_lot_id)).toBe(1);
    }
  });

  it("preserves history, re-keyed to the lot", () => {
    expect(n("SELECT COUNT(*) n FROM usage_events")).toBe(3);
    const arch = one<{ reason: string }>(
      "SELECT reason FROM usage_events WHERE stock_lot_id='it4' AND event='archived'",
    );
    expect(arch.reason).toBe("finished");
  });

  it("drops the superseded tables", () => {
    const left = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('items','usage_log')",
      )
      .all();
    expect(left).toEqual([]);
  });
});

describe("004 receipts migration", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const f of [
    "001_init.sql",
    "002_settings_and_reason.sql",
    "003_data_model.sql",
    "004_receipts.sql",
  ])
    db.exec(sql(f));

  it("creates the receipt tables", () => {
    const names = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining(["purchases", "purchase_lines", "receipt_aliases"]),
    );
  });

  it("enforces the product FK and the unique (retailer, normalized_text) alias key", () => {
    db.exec("INSERT INTO categories (id,name,warn_days,hard_expiry) VALUES ('c','C',14,0)");
    db.exec(
      "INSERT INTO products (id,name,brand,barcode,category_id,default_location_id,package_quantity,package_unit,image_url,created_at,updated_at) VALUES ('p','P',NULL,NULL,'c',NULL,NULL,NULL,NULL,'t','t')",
    );
    db.exec(
      "INSERT INTO receipt_aliases (id,retailer,normalized_text,product_id,confirmed_count,last_seen_at,created_at) VALUES ('a','tesco','chckpeas 400g','p',1,'t','t')",
    );
    expect(() =>
      db.exec(
        "INSERT INTO receipt_aliases (id,retailer,normalized_text,product_id,confirmed_count,last_seen_at,created_at) VALUES ('a2','tesco','chckpeas 400g','p',1,'t','t')",
      ),
    ).toThrow();
  });
});
