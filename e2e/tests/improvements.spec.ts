import { test, expect, type APIRequestContext } from "@playwright/test";

async function post<T>(request: APIRequestContext, path: string, data?: unknown): Promise<T> {
  const response = await request.post(path, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { data: T }).data;
}

test("history restores an accidentally removed pack", async ({ page, request }) => {
  const name = `Undo UI ${Date.now()}`;
  const created = await post<{ product: { id: string }; lot: { id: string } }>(
    request,
    "/api/intake",
    { name },
  );
  await post(request, `/api/stock-lots/${created.lot.id}/archive`, { reason: "mistake" });

  await page.goto("/history");
  const row = page.locator(".srow", { hasText: name }).first();
  await expect(row).toContainText("Removed a pack");
  await row.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".srow", { hasText: name }).first()).toContainText("Restored a pack");

  await page.goto("/food");
  await expect(page.getByText(name)).toBeVisible();
});

test("recipe actions update Shopping and activity from the Cook screen", async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const foodName = `Cook UI chickpeas ${stamp}`;
  const recipeName = `Cook UI supper ${stamp}`;
  const missing = `Cook UI lemon ${stamp}`;
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  await post(request, "/api/intake", {
    name: foodName,
    dateType: "best_before",
    dateValue: soon,
  });
  await post(request, "/api/recipes", {
    name: recipeName,
    ingredients: [foodName, missing],
    dietaryTags: [],
  });

  await page.goto("/use-it-up");
  const card = page.locator(".cook", { hasText: recipeName });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Add missing to Shopping" }).click();
  await expect(page.locator(".syncbar")).toContainText(missing);
  await card.getByRole("button", { name: "I cooked this" }).click();
  await expect(page.locator(".syncbar")).toContainText("Recorded");

  await page.goto("/shopping");
  await expect(page.getByText(missing)).toBeVisible();
});

test("settings exposes device health and protects database maintenance without auth", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(page.getByText("MagTag health")).toBeVisible();
  await expect(page.getByText("Home Assistant", { exact: true })).toBeVisible();
  await expect(page.getByText(/set auth_token in the EatMe app configuration/i)).toBeVisible();
  await expect(page.getByText("Automatic recovery snapshots")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export full backup" })).toBeVisible();
});
