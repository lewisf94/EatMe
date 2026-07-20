# P3 · Camera barcode scanning + installable PWA

**Goal:** scan a real barcode with the phone camera to prefill the Add form, and make the app installable to the Home Screen with offline-tolerant shell.

**Prerequisites:** P2 green.

> **Secure-context caveat:** `getUserMedia` (camera) only works on `https://` or `localhost`. On a laptop `http://localhost:5173` is fine for dev. On the **iPhone** it needs real HTTPS — that's delivered in **P4** (bundled Tailscale). So: build and unit-test scanning against a laptop webcam here; the on-iPhone verification box is 🖐 and may slip to after P4. Don't block P3 on it.

## Deliverables

1. A `<BarcodeScanner>` component using `barcode-detector` over a `getUserMedia` stream.
2. **Self-hosted zxing `.wasm`** (no CDN dependency) so it works under CSP/offline.
3. Wire the scanner into the P2 Add form (writes into the existing barcode field, then auto-looks-up).
4. PWA: manifest (`display: standalone`, icons, name), service worker via `vite-plugin-pwa` (autoUpdate), app shell caching. Installable + passes an install audit.

## Barcode scanning

Install `barcode-detector`. The library pulls its zxing `.wasm` from a CDN by default — **override it to a bundled local copy** so the PWA has no external runtime dependency (also required under a strict CSP):

```ts
// src/scanner/detector.ts
import { setZXingModuleOverrides } from "barcode-detector/pure";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url"; // Vite emits a hashed local asset
setZXingModuleOverrides({ locateFile: () => wasmUrl });
export { BarcodeDetector } from "barcode-detector/pure";
```
> ⚠️ The exact wasm sub-path/export name can shift between `barcode-detector`/`zxing-wasm` majors. If `zxing-wasm/reader/zxing_reader.wasm?url` doesn't resolve, find the shipped `.wasm` under `node_modules/zxing-wasm/dist/**` and import that path. Verify the wasm loads with **no network request** (DevTools → Network, filter `.wasm`, should be same-origin). Record the resolved path in research-notes if it differs.

`<BarcodeScanner onDetected>`:
- `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })` → `<video autoplay playsinline muted>` (`playsinline` is mandatory on iOS or it goes fullscreen).
- Loop with `requestAnimationFrame` (or `detector.detect(video)` on an interval ~200ms). On a hit with a plausible EAN/UPC value: stop the stream, `onDetected(value)`.
- Restrict formats: `new BarcodeDetector({ formats: ["ean_13","ean_8","upc_a","upc_e"] })`.
- Handle denied permission and "no camera" with a clear message + a manual-entry fallback (the P2 field is still there).
- **Always stop tracks** (`stream.getTracks().forEach(t => t.stop())`) on unmount/success or the camera light stays on.

Add a **"Scan" button** on the Add screen that mounts the scanner; on detect, fill the barcode field and trigger the existing P2 lookup automatically.

## PWA

Add `vite-plugin-pwa` to `vite.config.ts`:
```ts
VitePWA({
  registerType: "autoUpdate",
  manifest: {
    name: "WhatToEat", short_name: "WhatToEat", display: "standalone",
    background_color: "#ffffff", theme_color: "#0f172a", start_url: "/",
    icons: [ /* 192 + 512 PNG, plus a 512 maskable */ ],
  },
  workbox: { navigateFallback: "/index.html", globPatterns: ["**/*.{js,css,html,woff2,wasm,png,svg}"] },
})
```
- `display: standalone` is **non-negotiable** — iOS Web Push (P8) silently won't work without it.
- Precache the wasm (`**/*.wasm` above) so scanning works offline.
- Provide real icons (generate from a simple 🫙 mark; commit the PNGs under `apps/web/public/`).
- The service worker caches the **app shell**; API calls stay network-first (don't cache `/api` responses in this phase — stale inventory is worse than a spinner).

## Acceptance checklist

- [ ] `pnpm check` green (build emits a service worker + manifest).
- [ ] On a **laptop with a webcam** over `http://localhost` (dev), the Scan button opens the camera and decoding a printed/again-on-screen EAN-13 fills the barcode field and auto-looks-up.
- [ ] DevTools → Network shows the zxing `.wasm` loading **same-origin**, not from a CDN.
- [ ] Camera tracks stop when the scanner closes (camera indicator turns off).
- [ ] Lighthouse/PWA audit: **installable** (manifest + SW + offline shell). App shell loads with the network throttled to offline after first visit.
- [ ] 🖐 (may follow P4) On the **iPhone** over the P4 HTTPS URL: Add to Home Screen, launch standalone, Scan a real jar's barcode → prefilled. If HTTPS isn't up yet, note "deferred to post-P4" in your summary.

## Definition of done

Scanning works in a secure context and the app is installable/offline-capable. Commit `P3: camera barcode scanning + installable PWA`. **Stop.**
