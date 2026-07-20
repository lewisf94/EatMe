# P8 · Web Push notifications

**Goal:** the phone quietly nudges you — a Monday digest of what to use this week, and a day-before warning for things with a hard expiry. Deliberately sparse; nagging kills these apps.

**Prerequisites:** P1–P4 green. **P4 matters**: iOS only delivers Web Push to an **installed** PWA over **HTTPS** — both come from P4. On-device verification is 🖐.

## iOS preconditions (verified — non-negotiable)

- The PWA must be **added to the Home Screen** (not a Safari tab) and `manifest.display` must be `"standalone"` (set in P3).
- The permission prompt must fire from a **user gesture** (a tap on a "Turn on notifications" button), never on load.
- Standard VAPID. Subscriptions can **silently expire**; a send may return **`410 Gone`** → prune and let the user re-subscribe (idempotent button).

## Deliverables

1. Migration `004_push.sql`: `push_subscriptions`.
2. VAPID keys generated once on first boot, persisted to `DATA_DIR`, never regenerated.
3. `GET /api/push/public-key`, `POST /api/push/subscribe`, `POST /api/push/unsubscribe`, `POST /api/push/test`.
4. Service-worker `push` + `notificationclick` handlers.
5. A settings toggle ("Notifications") that requests permission and subscribes.
6. In-process schedule: Monday 09:00 digest; daily 08:00 hard-expiry day-before check.

## Migration `004`

```sql
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY, endpoint TEXT NOT NULL UNIQUE, keys_json TEXT NOT NULL, created_at TEXT NOT NULL
);
```

## Server (`services/push.ts`)

```ts
import webpush from "web-push";
// On boot: load VAPID from `${DATA_DIR}/vapid.json`; if absent, webpush.generateVAPIDKeys(),
// persist, and set details ("mailto:lewis@…", pub, priv). Expose pub via /api/push/public-key.

export async function sendTo(sub, payload) {
  try { await webpush.sendNotification(sub, JSON.stringify(payload)); }
  catch (e: any) {
    if (e.statusCode === 404 || e.statusCode === 410) deleteSubscriptionByEndpoint(sub.endpoint); // prune
    else throw e;
  }
}
```
- Payload shape: `{ title, body, url }` (url deep-links into the app, e.g. `/use-it-up`).
- **Scheduling**: a tiny in-process timer (check every ~15 min; fire when the local time crosses the target and it hasn't fired today — persist `last_fired` per job in the `settings` table so a restart doesn't double-send). Don't add a cron dependency.
  - **Monday 09:00** — digest: count of `use_soon` items → "5 things to use this week".
  - **Daily 08:00** — hard-expiry items whose `pressureDate` is tomorrow → "Curry paste expires tomorrow".
- `POST /api/push/test` sends a test notification to all subs (used by the settings button + acceptance).

## Web

- `apps/web` service worker (extend the `vite-plugin-pwa` SW — use `injectManifest` mode or an `additionalManifestEntries`/custom SW so you can add handlers):
  ```js
  self.addEventListener("push", (e) => {
    const d = e.data?.json() ?? {};
    e.waitUntil(self.registration.showNotification(d.title ?? "WhatToEat", { body: d.body, data: { url: d.url } }));
  });
  self.addEventListener("notificationclick", (e) => {
    e.notification.close();
    e.waitUntil(clients.openWindow(e.notification.data?.url ?? "/"));
  });
  ```
  > Switching to a custom SW means moving `vite-plugin-pwa` to `strategies: "injectManifest"` with a `src/sw.ts`. Follow the plugin's injectManifest docs; keep the precache glob from P3.
- Settings "Notifications" button: on tap → `Notification.requestPermission()` → if granted, `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <public-key> })` → `POST /api/push/subscribe`. Re-tapping re-subscribes idempotently (server upserts by endpoint).

## Acceptance checklist

- [ ] `pnpm check` green; VAPID file is created once and reused (delete-and-reboot regenerates; a normal reboot does not).
- [ ] `GET /api/push/public-key` returns a stable key.
- [ ] On **desktop Chrome** (secure context via P4 or `localhost`): enable notifications, `POST /api/push/test` → a notification appears; clicking it opens the app.
- [ ] A subscription that returns `410` on send is pruned (simulate by deleting the sub client-side then sending).
- [ ] The digest/day-before jobs select the right items (unit-test the selection functions with fixtures; don't wait for Monday).
- [ ] 🖐 On the **installed iPhone PWA**: the notifications toggle prompts, a test push arrives, and tapping it deep-links.

## Definition of done

Sparse, useful push works (server + desktop proven automatically; iPhone by Lewis). Commit `P8: web push notifications`. **Stop.**
