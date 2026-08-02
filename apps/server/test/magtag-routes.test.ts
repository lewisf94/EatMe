import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const DEVICE_TOKEN = "magtag-route-test-token";

let app: FastifyInstance;
let dataDir: string;
let db: (typeof import("../src/db.js"))["db"];
let atomic: (typeof import("../src/db.js"))["atomic"];
let getSetting: (typeof import("../src/repo/settings.js"))["getSetting"];
let setSetting: (typeof import("../src/repo/settings.js"))["setSetting"];

function expectMagTagBitmap(payload: Buffer): void {
  expect(payload.subarray(0, 2).toString("ascii")).toBe("BM");
  expect(payload.readUInt32LE(2)).toBe(payload.length);
  expect(payload.readInt32LE(18)).toBe(296);
  expect(payload.readInt32LE(22)).toBe(128);
  expect(payload.readUInt16LE(28)).toBe(4);
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "eatme-magtag-routes-"));
  vi.stubEnv("DATA_DIR", dataDir);
  vi.stubEnv("AUTH_TOKEN", "admin-route-test-token");
  vi.stubEnv("MAGTAG_TOKEN", DEVICE_TOKEN);

  const dbModule = await import("../src/db.js");
  db = dbModule.db;
  atomic = dbModule.atomic;
  dbModule.migrate();

  const { seedIfEmpty } = await import("../src/seed.js");
  seedIfEmpty();

  ({ getSetting, setSetting } = await import("../src/repo/settings.js"));
  const { buildApp } = await import("../src/app.js");
  app = buildApp();
  await app.ready();
}, 30_000);

afterAll(async () => {
  await app.close();
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
}, 30_000);

describe("MagTag routes", () => {
  it("reports database health and rolls failed write groups back", async () => {
    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ data: { ok: true } });

    setSetting("transaction_probe", "before");
    expect(() =>
      atomic(() => {
        setSetting("transaction_probe", "partial");
        throw new Error("forced rollback");
      }),
    ).toThrow("forced rollback");
    expect(getSetting("transaction_probe")).toBe("before");
  });

  it("requires the dedicated device token", async () => {
    const missing = await app.inject({
      method: "GET",
      url: "/api/magtag/display.bmp",
    });
    expect(missing.statusCode).toBe(401);
    expect(missing.headers["cache-control"]).toBe("no-store");
    expect(missing.headers["x-content-type-options"]).toBe("nosniff");
    expect(missing.headers["referrer-policy"]).toBe("no-referrer");

    const wrong = await app.inject({
      method: "GET",
      url: "/api/magtag/display.bmp?token=wrong-token",
    });
    expect(wrong.statusCode).toBe(401);

    const adminOnly = await app.inject({
      method: "GET",
      url: "/api/magtag/display.bmp",
      headers: { authorization: "Bearer admin-route-test-token" },
    });
    expect(adminOnly.statusCode).toBe(401);
  });

  it("serves every supported 296x128 four-colour page and records battery", async () => {
    const paths = [
      "/api/magtag/display.bmp?battery=73",
      "/api/magtag/page/urgent",
      "/api/magtag/page/recipe",
      "/api/magtag/page/shopping",
    ];

    for (const path of paths) {
      const separator = path.includes("?") ? "&" : "?";
      const response = await app.inject({
        method: "GET",
        url: `${path}${separator}token=${DEVICE_TOKEN}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("image/bmp");
      expect(response.headers["cache-control"]).toBe("no-store");
      expectMagTagBitmap(response.rawPayload);
    }

    expect(getSetting("display_battery")).toBe("73");
  });

  it("returns 404 for an unknown page", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/magtag/page/not-a-page?token=${DEVICE_TOKEN}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it("accepts and stores status reports", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/magtag/status?token=${DEVICE_TOKEN}`,
      payload: {
        battery: 61,
        wakeReason: "button_b",
        firmware: "test-firmware",
        rssi: -47,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { ok: true } });
    expect(getSetting("display_battery")).toBe("61");

    const stored = JSON.parse(getSetting("magtag_status") ?? "null") as Record<string, unknown>;
    expect(stored).toEqual(
      expect.objectContaining({
        battery: 61,
        wakeReason: "button_b",
        firmware: "test-firmware",
        rssi: -47,
        reportedAt: expect.any(String),
      }),
    );

    const invalid = await app.inject({
      method: "POST",
      url: `/api/magtag/status?token=${DEVICE_TOKEN}`,
      payload: { battery: 101 },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it("rejects oversized non-image request bodies", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/magtag/status?token=${DEVICE_TOKEN}`,
      payload: { firmware: "x".repeat(300_000) },
    });

    expect(response.statusCode).toBe(413);
  });

  it("stores valid button events and rejects invalid ones", async () => {
    const valid = await app.inject({
      method: "POST",
      url: `/api/magtag/button?token=${DEVICE_TOKEN}`,
      payload: { button: "shopping" },
    });

    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toEqual({ data: { ok: true } });
    expect(JSON.parse(getSetting("magtag_last_button") ?? "null")).toEqual({
      button: "shopping",
      at: expect.any(String),
    });

    const invalid = await app.inject({
      method: "POST",
      url: `/api/magtag/button?token=${DEVICE_TOKEN}`,
      payload: { button: "settings" },
    });

    expect(invalid.statusCode).toBe(400);
    expect(JSON.parse(getSetting("magtag_last_button") ?? "null")).toEqual({
      button: "shopping",
      at: expect.any(String),
    });
  });

  it("passes the reusable full deployment preflight", async () => {
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const script = fileURLToPath(new URL("../../../scripts/magtag-preflight.mjs", import.meta.url));
    const child = spawn(process.execPath, [script, address, "--full"], {
      env: { ...process.env, EATME_MAGTAG_TOKEN: DEVICE_TOKEN },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });

    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("MagTag full preflight passed.");
  }, 30_000);
});
