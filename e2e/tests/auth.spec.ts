import { test, expect } from "@playwright/test";

// This project (see playwright.config) points at a server started with
// AUTH_TOKEN set, so the optional bearer gate is active.

test("API rejects requests without the token", async ({ page }) => {
  await page.goto("/");
  const status = await page.evaluate(() => fetch("/api/inventory").then((r) => r.status));
  expect(status).toBe(401);
});

test("client sends the token from localStorage and the authed API works", async ({ context }) => {
  // Simulate the user pasting the token into Settings → Access token.
  await context.addInitScript(() => localStorage.setItem("eatme_token", "e2e-secret"));
  const page = await context.newPage();
  await page.goto("/add");

  // “Automatic” deliberately uses the empty value, so wait for a real
  // category option to establish that the authenticated request succeeded.
  await expect
    .poll(() => page.locator("#cat > option").count(), { timeout: 8000 })
    .toBeGreaterThan(1);
});
