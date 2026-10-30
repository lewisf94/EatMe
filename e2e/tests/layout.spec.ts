import { test, expect } from "@playwright/test";

test("a desktop window gets the side navigation in place of the bottom bar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const side = page.getByRole("complementary", { name: "Main" });
  await expect(side).toBeVisible();
  await expect(page.locator(".botnav")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();

  await side.getByRole("link", { name: "Recipes" }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(side.getByRole("link", { name: "Recipes" })).toHaveClass(/on/);

  await side.getByRole("link", { name: "Add item" }).click();
  await expect(page).toHaveURL(/\/add$/);
});

test("a phone keeps the bottom bar and no side navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".botnav")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Main" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
});
