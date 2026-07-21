import { test, expect } from "@playwright/test";

// Chromium is launched (see playwright.config) with a synthetic webcam clip of a
// valid EAN-13; these assertions prove the real scanner decodes it and that the
// zxing decoder wasm is self-hosted (no CDN), which matters for CSP + offline.
const EAN13 = "4006381333931";

test("camera scan decodes a barcode into the field, wasm served same-origin", async ({
  page,
  baseURL,
}) => {
  const reqs: string[] = [];
  page.on("request", (r) => reqs.push(r.url()));

  await page.goto("/add");
  await page.getByRole("button", { name: "Scan" }).click();
  await expect(page.getByTestId("scanner")).toBeVisible();

  await page.waitForFunction(
    (code) => (document.querySelector("#barcode") as HTMLInputElement | null)?.value === code,
    EAN13,
    { timeout: 20_000 },
  );
  await expect(page.locator("#barcode")).toHaveValue(EAN13);

  const wasm = reqs.filter((u) => /\.wasm(\?|$)/.test(u));
  expect(wasm.length).toBeGreaterThan(0);
  expect(wasm.every((u) => u.startsWith(baseURL!))).toBe(true);
  expect(reqs.some((u) => /jsdelivr|unpkg|cdn\.|googleapis/.test(u))).toBe(false);
});
