import { test, expect, type Page } from "@playwright/test";

/** Add a product through the real form and land on its product page. */
async function addItem(page: Page, name: string, dateValue?: string): Promise<string> {
  await page.goto("/add");
  // The category <select> only has a value once GET /api/categories resolves.
  await page.waitForFunction(() => {
    const s = document.querySelector("#cat") as HTMLSelectElement | null;
    return !!(s && s.value);
  });
  await page.locator("#name").fill(name);
  if (dateValue) await page.locator("#bb").fill(dateValue);
  await page.getByRole("button", { name: "Add to cupboard" }).click();
  await page.waitForURL("**/product/**");
  return page.url();
}

const productId = (url: string) => url.split("/product/")[1];

function plusDays(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

test("app shell is served by the server (production build)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("EatMe");
});

test("add → product page shows a freshness badge and quick-tap fraction persists", async ({
  page,
}) => {
  await addItem(page, "Playwright Paprika", plusDays(3));
  await expect(page.locator("h2")).toContainText("Playwright Paprika");
  await expect(page.getByText("Use soon")).toBeVisible();

  await page.getByTestId("fraction-0.5").click();
  await page.waitForTimeout(250);
  await page.reload();
  await expect(page.getByTestId("lot-card")).toContainText("½");
});

test("cupboard lists the product and search narrows it", async ({ page }) => {
  await addItem(page, "Searchable Saffron");
  await page.goto("/");
  await expect(page.getByText("Searchable Saffron")).toBeVisible();

  await page.locator('input[aria-label="Search"]').fill("saffron");
  await expect(page.getByText("Searchable Saffron")).toBeVisible();
  await page.locator('input[aria-label="Search"]').fill("zzzznope");
  await expect(page.getByText("Searchable Saffron")).toHaveCount(0);
});

test("clearing the lot date sends null and the server unsets it", async ({ page }) => {
  const url = await addItem(page, "Clearable Chutney", "2026-09-01");
  const dateInput = page.locator('[data-testid="lot-card"] input[type="date"]');
  await expect(dateInput).toHaveValue("2026-09-01");

  await dateInput.fill("");
  await page.waitForTimeout(300); // PATCH round-trip + reload
  await expect(dateInput).toHaveValue("");

  const cleared = await page.evaluate(
    (id) =>
      fetch(`/api/products/${id}`)
        .then((r) => r.json())
        .then((j) => j.data.lots[0].dateValue == null && j.data.lots[0].dateType == null),
    productId(url),
  );
  expect(cleared).toBe(true);
});

test("removing the only pack empties the product (and drops it from the cupboard)", async ({
  page,
}) => {
  const url = await addItem(page, "Archivable Anchovies");

  await page.getByTestId("archive-lot").click();
  await expect(page.getByTestId("archive-reason-finished")).toBeVisible();
  await page.getByTestId("archive-reason-finished").click();

  await expect(page.getByTestId("lot-card")).toHaveCount(0);
  await expect(page.getByText("No stock left")).toBeVisible();

  // gone from the aggregated cupboard (no active lots) but the archived lot remains
  await page.goto("/");
  await expect(page.getByText("Archivable Anchovies")).toHaveCount(0);
  const stillThere = await page.evaluate(
    (id) =>
      fetch(`/api/products/${id}?includeArchived=1`)
        .then((r) => r.json())
        .then((j) => j.data.lots.some((l: { archivedAt: string | null }) => l.archivedAt != null)),
    productId(url),
  );
  expect(stillThere).toBe(true);
});

test("two packs of one product aggregate into a single cupboard row", async ({ page }) => {
  const url = await addItem(page, "Doubled Dates");
  await page.getByTestId("add-lot").click();
  await expect(page.getByTestId("lot-card")).toHaveCount(2);

  await page.goto("/");
  const row = page.locator('[data-testid="inventory-list"] li', { hasText: "Doubled Dates" });
  await expect(row).toHaveCount(1);
  await expect(row.getByText("2 packs")).toBeVisible();
  // sanity: server agrees it's one product with two active lots
  const lots = await page.evaluate(
    (id) =>
      fetch(`/api/products/${id}`)
        .then((r) => r.json())
        .then((j) => j.data.lots.length),
    productId(url),
  );
  expect(lots).toBe(2);
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
