import { test, expect, type Page } from "@playwright/test";

/** Add a product through the real form and land on its product page. */
async function addItem(page: Page, name: string): Promise<string> {
  await page.goto("/add");
  await page.waitForFunction(() => {
    const s = document.querySelector("#cat") as HTMLSelectElement | null;
    return !!(s && s.value);
  });
  await page.locator("#name").fill(name);
  await page.getByRole("button", { name: "Add to cupboard" }).click();
  await page.waitForURL("**/product/**");
  return page.url();
}
const productId = (url: string) => url.split("/product/")[1];

/** Make sure the service worker controls the page so navigations work offline. */
async function ensureServiceWorker(page: Page) {
  const controlled = () =>
    page
      .waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
  if (!(await controlled())) {
    await page.reload();
    await controlled();
  }
}

test("offline: cached cupboard is searchable, and an offline fraction change replays once", async ({
  page,
  context,
}) => {
  const url = await addItem(page, "Offline Oregano");
  const id = productId(url);

  // Prime the snapshot while online: the cupboard list and the product page.
  await page.goto("/food");
  await expect(page.getByText("Offline Oregano")).toBeVisible();
  await page.goto(url);
  await expect(page.locator(".title-line")).toContainText("Offline Oregano");
  await ensureServiceWorker(page);

  // ---- go offline --------------------------------------------------------
  await context.setOffline(true);

  // 1) the cupboard is visible AND searchable from the cache ("do I have X?").
  await page.goto("/food");
  await expect(page.getByText("Offline Oregano")).toBeVisible();
  const search = page.locator('input[aria-label="Search"]');
  await search.fill("oregano");
  await expect(page.getByText("Offline Oregano")).toBeVisible();
  await search.fill("zzzznope");
  await expect(page.getByText("Offline Oregano")).toHaveCount(0);

  // 2) change the amount to ½ while offline → queued and shown as pending.
  await page.goto(url);
  await page.getByRole("button", { name: "Update" }).first().click();
  await page.getByTestId("fraction-0.5").click();
  await expect(page.locator(".pendingtag")).toBeVisible();
  await expect(page.getByTestId("lot-card")).toContainText("½");

  // ---- reconnect → the queue replays -------------------------------------
  await context.setOffline(false);
  await page.goto(url); // resuming online triggers the replay on boot

  // the queued change reached the server exactly once (op-id idempotent).
  await expect
    .poll(
      () =>
        page.evaluate(
          (pid) =>
            fetch(`/api/products/${pid}`)
              .then((r) => r.json())
              .then((j) => j.data.lots[0].fractionLeft),
          id,
        ),
      { timeout: 10_000 },
    )
    .toBe(0.5);

  // nothing left waiting, and a reload doesn't double-apply.
  await expect(page.locator(".pendingtag")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("lot-card")).toContainText("½");
});
