import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let app: FastifyInstance;
let dataDir: string;
let db: (typeof import("../src/db.js"))["db"];

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "eatme-improvements-"));
  vi.stubEnv("DATA_DIR", dataDir);
  vi.stubEnv("AUTH_TOKEN", "");
  vi.stubEnv("RECEIPT_PROVIDER", "stub");

  const dbModule = await import("../src/db.js");
  db = dbModule.db;
  dbModule.migrate();
  const { seedIfEmpty } = await import("../src/seed.js");
  seedIfEmpty();
  const { buildApp } = await import("../src/app.js");
  app = buildApp();
  await app.ready();
}, 30_000);

afterAll(async () => {
  await app.close();
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
}, 30_000);

async function intake(name: string, extra: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: "POST",
    url: "/api/intake",
    payload: { name, ...extra },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data as { product: { id: string }; lot: { id: string } };
}

describe("undo, activity, and insights", () => {
  it("restores an archived pack while retaining an honest audit trail", async () => {
    const created = await intake("Undo yoghurt", { fractionLeft: 0.5 });
    const archived = await app.inject({
      method: "POST",
      url: `/api/stock-lots/${created.lot.id}/archive`,
      payload: { reason: "binned" },
    });
    expect(archived.statusCode).toBe(200);

    const before = await app.inject({ method: "GET", url: "/api/activity" });
    expect(before.json().data[0]).toEqual(
      expect.objectContaining({ productName: "Undo yoghurt", event: "archived", canRestore: true }),
    );

    const restored = await app.inject({
      method: "POST",
      url: `/api/stock-lots/${created.lot.id}/restore`,
    });
    expect(restored.json().data.archivedAt).toBeNull();
    const after = await app.inject({ method: "GET", url: "/api/activity" });
    expect(after.json().data[0]).toEqual(
      expect.objectContaining({ productName: "Undo yoghurt", event: "restored" }),
    );
    expect(
      after.json().data.find((entry: { event: string }) => entry.event === "archived").canRestore,
    ).toBe(false);
  });

  it("calculates finished/binned patterns and price-backed value estimates", async () => {
    const first = await intake("Priced beans", { fractionLeft: 0.5 });
    const secondLot = await app.inject({
      method: "POST",
      url: "/api/stock-lots",
      payload: { productId: first.product.id, count: 1, fractionLeft: 1 },
    });
    expect(secondLot.statusCode).toBe(200);
    const secondId = secondLot.json().data.id as string;

    db.prepare(
      "INSERT INTO purchases (id,merchant,purchased_at,source,image_hash,status,created_at) VALUES ('price-purchase','Shop','2026-08-01','test',NULL,'confirmed','2026-08-01T00:00:00Z')",
    ).run();
    db.prepare(
      `INSERT INTO purchase_lines
       (id,purchase_id,line_no,raw_text,normalized_text,quantity,unit_price,line_total,
        extraction_confidence,matched_product_id,chosen_location_id,status,created_at)
       VALUES ('price-line','price-purchase',1,'BEANS','beans',1,2,2,1,?,NULL,'added','2026-08-01T00:00:00Z')`,
    ).run(first.product.id);

    await app.inject({
      method: "POST",
      url: `/api/stock-lots/${first.lot.id}/archive`,
      payload: { reason: "binned" },
    });
    await app.inject({
      method: "POST",
      url: `/api/stock-lots/${secondId}/archive`,
      payload: { reason: "finished" },
    });
    const response = await app.inject({ method: "GET", url: "/api/insights?days=90" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(
      expect.objectContaining({
        binned: 1,
        finished: 1,
        estimatedValueWasted: 1,
        estimatedValueUsed: 2,
      }),
    );
  });
});

describe("recipe actions", () => {
  it("adds missing ingredients once and records cooking without guessing quantities", async () => {
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const food = await intake("Recipe chickpeas", { dateType: "best_before", dateValue: soon });
    const recipe = await app.inject({
      method: "POST",
      url: "/api/recipes",
      payload: { name: "Chickpea supper", ingredients: ["chickpea", "lemon"], dietaryTags: [] },
    });
    const recipeId = recipe.json().data.id as string;

    const firstShop = await app.inject({
      method: "POST",
      url: `/api/recipes/${recipeId}/shop-missing`,
    });
    const secondShop = await app.inject({
      method: "POST",
      url: `/api/recipes/${recipeId}/shop-missing`,
    });
    expect(firstShop.json().data.added).toEqual(["lemon"]);
    expect(secondShop.json().data.added).toEqual([]);

    const cooked = await app.inject({ method: "POST", url: `/api/recipes/${recipeId}/cooked` });
    expect(cooked.json().data.used).toEqual(["Recipe chickpeas"]);
    const stored = db
      .prepare("SELECT event FROM usage_events WHERE stock_lot_id = ? ORDER BY at DESC LIMIT 1")
      .get(food.lot.id);
    expect(stored).toEqual({ event: "cooked" });
    const lot = db.prepare("SELECT fraction_left FROM stock_lots WHERE id = ?").get(food.lot.id);
    expect(lot).toEqual({ fraction_left: 1 });
  });
});

describe("backup and database maintenance", () => {
  it("round-trips a versioned backup and rejects malformed input atomically", async () => {
    await intake("In backup");
    const exported = await app.inject({ method: "GET", url: "/api/maintenance/backup" });
    expect(exported.statusCode).toBe(200);
    const backup = exported.json();
    expect(backup).toEqual(expect.objectContaining({ format: "eatme-backup", version: 1 }));

    await intake("Added after backup");
    const invalid = structuredClone(backup) as Record<string, unknown>;
    invalid.format = "not-eatme";
    const rejected = await app.inject({
      method: "POST",
      url: "/api/maintenance/restore",
      payload: invalid,
    });
    expect(rejected.statusCode).toBe(400);
    expect(db.prepare("SELECT 1 FROM products WHERE name='Added after backup'").get()).toBeTruthy();

    const restored = await app.inject({
      method: "POST",
      url: "/api/maintenance/restore",
      payload: backup,
    });
    expect(restored.statusCode).toBe(200);
    expect(
      db.prepare("SELECT 1 FROM products WHERE name='Added after backup'").get(),
    ).toBeUndefined();
    const integrity = await app.inject({ method: "GET", url: "/api/maintenance/integrity" });
    expect(integrity.json().data).toEqual({ ok: true, quickCheck: "ok", foreignKeyErrors: 0 });
  });
});

describe("Home Assistant publishing", () => {
  it("publishes both native sensors through the supported app API", async () => {
    vi.stubEnv("SUPERVISOR_TOKEN", "test-supervisor-token");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const response = await app.inject({ method: "POST", url: "/api/home-assistant/sync" });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual(
        expect.objectContaining({ available: true, synced: true }),
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
        expect.arrayContaining([
          expect.stringContaining("/states/sensor.eatme_expiring_soon"),
          expect.stringContaining("/states/sensor.eatme_low_stock"),
        ]),
      );
      expect(fetchMock.mock.calls[0][1]?.headers).toEqual(
        expect.objectContaining({ authorization: "Bearer test-supervisor-token" }),
      );
    } finally {
      vi.unstubAllGlobals();
      vi.stubEnv("SUPERVISOR_TOKEN", "");
    }
  });
});
