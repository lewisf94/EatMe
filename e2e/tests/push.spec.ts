import { test, expect } from "@playwright/test";

// Valid subscription keys (standard test vectors) with an endpoint that can't be
// delivered to. Pruning proper (a push service answering 404/410) needs a real
// push service, which CI can't reach — that classification is unit-tested in
// push.test.ts, and end-to-end delivery is part of the manual iPhone check.
// What matters here is the opposite guarantee: a delivery *failure* must never
// throw, and must never lose the device.
const keys = {
  p256dh: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
  auth: "tBHItJI5svbpez7KI4CCXg",
};

const data = async <T>(r: { json: () => Promise<unknown> }): Promise<T> =>
  ((await r.json()) as { data: T }).data;

test("push: a stable key, upserted subscriptions, and a failed send that keeps the device", async ({
  request,
}) => {
  const goneSub = { endpoint: "https://localhost:9/eatme-unreachable", keys };

  // A stable VAPID public key is served for the client to subscribe with.
  const key = await data<{ publicKey: string }>(await request.get("/api/push/public-key"));
  expect(key.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
  expect(
    (await data<{ publicKey: string }>(await request.get("/api/push/public-key"))).publicKey,
  ).toBe(key.publicKey);

  const subscribers = async () =>
    (await data<{ subscribers: number }>(await request.get("/api/push/public-key"))).subscribers;
  const before = await subscribers();

  expect((await request.post("/api/push/subscribe", { data: goneSub })).status()).toBe(201);
  expect(await subscribers()).toBe(before + 1);

  // Subscribing the same device again is an upsert, not a duplicate.
  expect((await request.post("/api/push/subscribe", { data: goneSub })).status()).toBe(201);
  expect(await subscribers()).toBe(before + 1);

  expect((await request.post("/api/push/subscribe", { data: { endpoint: "" } })).status()).toBe(400);

  // A send that can't be delivered is reported, not thrown — and the device is
  // kept, because "couldn't reach the push service" is not "this device is gone".
  const result = await data<{ sent: number; pruned: number; failed: number }>(
    await request.post("/api/push/test"),
  );
  expect(result).toEqual({ sent: 0, pruned: 0, failed: 1 });
  expect(await subscribers()).toBe(before + 1);

  // The scheduled jobs run at most once per local day.
  await request.post("/api/push/run-jobs");
  expect((await data<{ ran: string[] }>(await request.post("/api/push/run-jobs"))).ran).toEqual([]);

  // Unsubscribe removes the row the client knows about.
  const removed = await data<{ removed: boolean }>(
    await request.post("/api/push/unsubscribe", { data: { endpoint: goneSub.endpoint } }),
  );
  expect(removed.removed).toBe(true);
  expect(await subscribers()).toBe(before);
});

test("the service worker ships the push handlers", async ({ request }) => {
  const sw = await (await request.get("/sw.js")).text();
  expect(sw).toContain("notificationclick");
  expect(sw).toContain("showNotification");
});
