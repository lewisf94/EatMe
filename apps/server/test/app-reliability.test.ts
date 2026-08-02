import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let app: FastifyInstance;
let dataDir: string;
let db: (typeof import("../src/db.js"))["db"];
let categoryId: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "eatme-reliability-"));
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

  const categories = await app.inject({ method: "GET", url: "/api/categories" });
  categoryId = categories.json().data[0].id as string;
}, 30_000);

afterAll(async () => {
  await app.close();
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
}, 30_000);

async function createProduct(name: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/products",
    payload: { name, categoryId },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.id as string;
}

describe("atomic API writes", () => {
  it("rolls a shopping tick back if repurchase creation fails", async () => {
    const productId = await createProduct("Rollback oats");
    const added = await app.inject({
      method: "POST",
      url: "/api/shopping-list",
      payload: { productId },
    });
    const itemId = added.json().data.id as string;

    db.exec(`CREATE TRIGGER fail_shopping_lot
      BEFORE INSERT ON stock_lots WHEN NEW.source = 'shopping'
      BEGIN SELECT RAISE(ABORT, 'forced shopping failure'); END`);
    try {
      const failed = await app.inject({
        method: "POST",
        url: `/api/shopping-list/${itemId}/done`,
      });
      expect(failed.statusCode).toBe(500);
      expect(failed.json()).toEqual({ error: { message: "internal server error" } });
      expect(db.prepare("SELECT done_at FROM shopping_list WHERE id = ?").get(itemId)).toEqual({
        done_at: null,
      });
    } finally {
      db.exec("DROP TRIGGER fail_shopping_lot");
    }
  });

  it("creates only one replacement lot when a shopping tick is retried", async () => {
    const productId = await createProduct("Retry rice");
    const added = await app.inject({
      method: "POST",
      url: "/api/shopping-list",
      payload: { productId },
    });
    const itemId = added.json().data.id as string;

    const first = await app.inject({
      method: "POST",
      url: `/api/shopping-list/${itemId}/done`,
    });
    const retry = await app.inject({
      method: "POST",
      url: `/api/shopping-list/${itemId}/done`,
    });

    expect(first.statusCode).toBe(200);
    expect(first.json().data.lot).not.toBeNull();
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data.lot).toBeNull();
    const count = db
      .prepare("SELECT COUNT(*) AS count FROM stock_lots WHERE product_id = ?")
      .get(productId) as { count: number };
    expect(count.count).toBe(1);
  });

  it("does not leave a partial receipt when line persistence fails", async () => {
    const before = db.prepare("SELECT COUNT(*) AS count FROM purchases").get() as {
      count: number;
    };
    db.exec(`CREATE TRIGGER fail_receipt_line
      BEFORE INSERT ON purchase_lines
      BEGIN SELECT RAISE(ABORT, 'forced receipt failure'); END`);
    try {
      const failed = await app.inject({
        method: "POST",
        url: "/api/receipts",
        headers: { "content-type": "application/octet-stream" },
        payload: Buffer.from("stub provider ignores image content"),
      });
      expect(failed.statusCode).toBe(500);
      expect(failed.json()).toEqual({ error: { message: "internal server error" } });
      const after = db.prepare("SELECT COUNT(*) AS count FROM purchases").get() as {
        count: number;
      };
      expect(after.count).toBe(before.count);
    } finally {
      db.exec("DROP TRIGGER fail_receipt_line");
    }
  });

  it("rolls recipe fields and ingredients back together", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/recipes",
      payload: { name: "Original soup", ingredients: ["lentils"], dietaryTags: [] },
    });
    const recipeId = created.json().data.id as string;

    db.exec(`CREATE TRIGGER fail_recipe_ingredient
      BEFORE INSERT ON recipe_ingredients WHEN NEW.match_text = 'explode'
      BEGIN SELECT RAISE(ABORT, 'forced recipe failure'); END`);
    try {
      const failed = await app.inject({
        method: "PATCH",
        url: `/api/recipes/${recipeId}`,
        payload: { name: "Changed soup", ingredients: ["explode"] },
      });
      expect(failed.statusCode).toBe(500);
      expect(failed.json()).toEqual({ error: { message: "internal server error" } });
    } finally {
      db.exec("DROP TRIGGER fail_recipe_ingredient");
    }

    const stored = await app.inject({ method: "GET", url: `/api/recipes/${recipeId}` });
    expect(stored.json().data).toEqual(
      expect.objectContaining({ name: "Original soup", ingredients: ["lentils"] }),
    );
  });
});

describe("input validation", () => {
  it("rejects a malformed Push endpoint without throwing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/push/subscribe",
      payload: { endpoint: "" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toBe("invalid subscription");
  });
});

describe("bounded external lookups", () => {
  it("rejects malformed barcodes without making an upstream request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const response = await app.inject({ method: "GET", url: "/api/lookup/not-a-barcode" });
      expect(response.statusCode).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shares one upstream request between concurrent scans", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fetchMock = vi.fn(async () => {
      await gate;
      return new Response(
        JSON.stringify({ status: 1, product: { product_name: "Concurrent beans" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const first = app.inject({ method: "GET", url: "/api/lookup/5000000000001" });
      const second = app.inject({ method: "GET", url: "/api/lookup/5000000000001" });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      release();
      const responses = await Promise.all([first, second]);
      expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
