/// <reference lib="webworker" />
// Custom service worker. It does everything the generated one did — precache the
// app shell + scanner wasm, and fall back to index.html for client routes — plus
// the push handlers, which is why we build it ourselves (injectManifest).
import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { clientsClaim } from "workbox-core";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

// Client-side routes resolve on reload; /api never gets the SPA shell.
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html"), { denylist: [/^\/api/] }));

// Match the old autoUpdate behaviour: a new version takes over immediately.
self.skipWaiting();
clientsClaim();

type PushBody = { title?: string; body?: string; url?: string };

self.addEventListener("push", (event) => {
  let data: PushBody = {};
  try {
    data = (event.data?.json() as PushBody) ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? "EatMe", {
      body: data.body ?? "",
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      data: { url: data.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil(
    (async () => {
      // Focus an open EatMe window if there is one, rather than piling up tabs.
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
