import { test, expect } from "@playwright/test";

test("manifest is installable (standalone + required icons)", async ({ page }) => {
  await page.goto("/");
  const href = await page.getAttribute('link[rel="manifest"]', "href");
  expect(href).toBeTruthy();

  const manifest = await page.evaluate(async (h) => (await fetch(h!)).json(), href);
  // display:standalone is a precondition for iOS "Add to Home Screen" + Web Push.
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === "192x192")).toBe(true);
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === "512x512")).toBe(true);
  expect(
    manifest.icons.some((i: { purpose?: string }) => (i.purpose ?? "").includes("maskable")),
  ).toBe(true);
});

test("service worker installs and serves the app shell offline", async ({ page, context }) => {
  const reqs: string[] = [];
  page.on("request", (r) => reqs.push(r.url()));

  await page.goto("/");
  // Wait for the SW to take control (may need one reload after first install).
  let controlled = await page
    .waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!controlled) {
    await page.reload();
    controlled = await page
      .waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
  }
  expect(controlled).toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toContainText("WhatToEat");
  await context.setOffline(false);

  // Nothing should come from a CDN — everything is bundled/self-hosted.
  expect(reqs.some((u) => /jsdelivr|unpkg|cdn\.|googleapis/.test(u))).toBe(false);
});
