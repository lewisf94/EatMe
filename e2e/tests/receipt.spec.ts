import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RECEIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures/receipt.png",
);

// The e2e servers run with the default stub OCR provider, so uploading any image
// yields the canned Tesco receipt — enough to drive the real review → confirm →
// stock flow, and to prove aliases auto-match on a second import.
test("receipt import: photo → review → confirm creates stock, re-import auto-matches", async ({
  page,
}) => {
  await page.goto("/add");
  await page.getByRole("link", { name: /Scan a receipt/i }).click();
  await page.waitForURL("**/receipt");

  await page.locator('[data-testid="receipt-file"]').setInputFiles(RECEIPT);
  await expect(page.getByTestId("receipt-review")).toBeVisible();
  // the parser kept 4 product lines (totals/bag/discount dropped)
  await expect(page.locator('[data-testid="receipt-review"] > li')).toHaveCount(4);

  await page.getByTestId("receipt-confirm").click();
  await expect(page.getByText(/Added 4 to the cupboard/)).toBeVisible();

  // the products are now in the cupboard, and the "2 x" line made a 2-count lot
  await page.goto("/");
  await expect(page.getByText("tinned tomatoes")).toBeVisible();
  await expect(page.getByText("2 packs")).toBeVisible();

  // second import of the same receipt → every line auto-matches via a learned alias
  await page.goto("/receipt");
  await page.locator('[data-testid="receipt-file"]').setInputFiles(RECEIPT);
  await expect(page.getByTestId("receipt-review")).toBeVisible();
  const aliasMatches = await page
    .locator('[data-testid="receipt-review"] option')
    .filter({ hasText: "(alias)" })
    .count();
  expect(aliasMatches).toBe(4);
});
