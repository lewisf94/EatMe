import { test, expect, type Page } from "@playwright/test";

/** Add an item through the real form and land on its detail page. */
async function addItem(page: Page, name: string, bestBefore?: string): Promise<string> {
  await page.goto("/add");
  // The category <select> only has a value once GET /api/categories resolves.
  await page.waitForFunction(() => {
    const s = document.querySelector("#cat") as HTMLSelectElement | null;
    return !!(s && s.value);
  });
  await page.locator("#name").fill(name);
  if (bestBefore) await page.locator("#bb").fill(bestBefore);
  await page.getByRole("button", { name: "Add to cupboard" }).click();
  await page.waitForURL("**/item/**");
  return page.url();
}

function plusDays(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

test("app shell is served by the server (production build)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("WhatToEat");
});

test("add → detail shows a freshness badge and quick-tap fraction persists", async ({ page }) => {
  const url = await addItem(page, "Playwright Paprika", plusDays(3));
  await expect(page.locator("h2")).toContainText("Playwright Paprika");
  await expect(page.getByText("Use soon")).toBeVisible();

  await page.getByTestId("fraction-0.5").click();
  await page.waitForTimeout(200);
  await page.reload();
  await expect(page.locator('p:has-text("How much is left")')).toContainText("½");

  // SPA deep-link: a hard reload on /item/:id must resolve (server serves index.html).
  await page.goto(url);
  await expect(page.locator("h2")).toContainText("Playwright Paprika");
});

test("inventory search narrows the list", async ({ page }) => {
  await addItem(page, "Searchable Saffron");
  await page.goto("/");
  await expect(page.getByText("Searchable Saffron")).toBeVisible();

  await page.locator('input[aria-label="Search"]').fill("saffron");
  await expect(page.getByText("Searchable Saffron")).toBeVisible();
  await page.locator('input[aria-label="Search"]').fill("zzzznope");
  await expect(page.getByText("Searchable Saffron")).toHaveCount(0);
});

test("clearing best-before sends null and the server unsets it", async ({ page }) => {
  const url = await addItem(page, "Clearable Chutney", "2026-09-01");
  await expect(page.locator("#bb")).toHaveValue("2026-09-01");

  await page.locator("#bb").fill("");
  await page.waitForTimeout(300); // PATCH round-trip
  await page.reload();
  await expect(page.locator("#bb")).toHaveValue("");

  const id = url.split("/item/")[1];
  const nulled = await page.evaluate(
    (i) =>
      fetch(`/api/items/${i}`)
        .then((r) => r.json())
        .then((j) => j.data.bestBefore == null),
    id,
  );
  expect(nulled).toBe(true);
});

test("archive uses the reason picker and hides the item (still retrievable)", async ({ page }) => {
  await addItem(page, "Archivable Anchovies");

  await page.getByTestId("archive-item").click();
  await expect(page.getByTestId("archive-reason-finished")).toBeVisible();
  await page.getByTestId("archive-reason-finished").click();
  await page.waitForURL("**/");

  await expect(page.getByText("Archivable Anchovies")).toHaveCount(0);
  const stillThere = await page.evaluate(() =>
    fetch("/api/items?includeArchived=1")
      .then((r) => r.json())
      .then((j) => j.data.some((i: { name: string }) => i.name === "Archivable Anchovies")),
  );
  expect(stillThere).toBe(true);
});

test("no console or page errors during a normal session", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });
  await addItem(page, "Quiet Quinoa", plusDays(5));
  await page.goto("/");
  await page.goto("/settings");
  expect(errors).toEqual([]);
});
