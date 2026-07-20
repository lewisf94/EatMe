# Research notes & verified facts

Everything here was checked against live sources in **July 2026** by Claude Fable 5 before the phase files were written. When a phase says "verified", this is where. If you (the implementing agent) find any of it is now wrong, **add a dated entry under [Deviations](#deviations) and report — do not silently work around it.**

## Verified library versions (npm `latest`, July 2026)

Install at these majors; let the minor float unless a phase pins tighter.

| Package | Major seen | Notes |
|---|---|---|
| `fastify` | 5.x | |
| `vite` | 8.x | Use current; plugins below track it. |
| `react` / `react-dom` | 19.x | |
| `@tailwindcss/vite` / `tailwindcss` | 4.x | v4 config lives in `vite.config` + a single `@import "tailwindcss";`. |
| `vite-plugin-pwa` | 1.x | |
| `barcode-detector` | 3.x | zxing-wasm under the hood; `.wasm` fetched at runtime → must self-host (P3). |
| `zxing-wasm` | 3.x | Transitive; pin only if overriding the wasm path. |
| `@resvg/resvg-js` | 2.x | Prebuilt `linux-arm64-musl` binary confirmed to exist. |
| `web-push` | 3.x | |
| `qrcode` | 1.x | |
| `zod` | 4.x | |
| `typescript` | 5.9 (chosen) | 7.x is out but we stay on 5.x — see conventions. |

## `node:sqlite`

- Stable enough: **Release Candidate**, added v22.5.0, no longer flagged experimental as of v23.4.0 / v22.13.0. On **Node 24 no `--experimental-sqlite` flag is needed**; a mild runtime warning is acceptable. If a given Node build *refuses* the import without the flag, add `--experimental-sqlite` to the start script and note it under Deviations.
- API: `import { DatabaseSync } from 'node:sqlite'`. `new DatabaseSync(path)`, `.exec(sql)`, `.prepare(sql)` → `StatementSync` with `.run(...)` → `{ changes, lastInsertRowid }`, `.get(...)` → row | undefined, `.all(...)` → rows, `.iterate(...)`. Named params via `@name`/`$name`/`:name` object, positional via `?`.
- Enable at boot: `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`.

## Open Food Facts

- Endpoint: `GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json`.
- **Rate limit: 15 read req/min per IP** → HTTP 503 if exceeded. Single-user + our cache makes this a non-issue; never batch-hammer it.
- **A custom `User-Agent` is mandatory.** Send `OFF_USER_AGENT`.
- Trim payload with `?fields=product_name,brands,quantity,image_front_small_url,categories_tags`.
- A `200` with `status: 0` means "product not found" → fall through to manual entry, keep the barcode.

## Home Assistant Tailscale add-on — the constraint that shaped P4

- The official **`hassio-addons/app-tailscale` add-on only serves *Home Assistant itself*** (`share_homeassistant`), on ports **443/8443/10000 only**. It **cannot** reverse-proxy another add-on or an arbitrary `localhost:8099`, and it does not export its certs to `/ssl` for others to use.
- Therefore **our add-on bundles its own `tailscaled`** (userspace mode) and runs `tailscale serve` itself. This is the only clean way to get a real HTTPS cert reachable by the iPhone both at home and away — which the camera (secure-context `getUserMedia`) and Web Push both require. Full recipe in [P4](04-phase-ha-addon.md).
- ⚠️ Exact `tailscale serve` flags drift between releases. P4 says to confirm with `tailscale serve --help` inside the container. The intent: background-serve HTTPS:443 → `http://127.0.0.1:8099`.

## iOS Web Push (drives P8)

- Works **only** for a PWA added to the Home Screen (not a Safari tab), with `manifest.display: "standalone"`.
- Permission must be requested **from a user gesture** (a tap), not on load.
- Standard VAPID via `web-push`. Subscriptions can silently expire after long inactivity → server must tolerate `410 Gone` on send and prune. This is why the subscribe button re-subscribes idempotently.

## E-ink hardware — recommendation changed after research

Original draft picked the LILYGO T5 4.7". Research changed the primary pick:

- **Seeed reTerminal E1001** — 7.5" mono, **800×480**, 4-level greyscale, **ESP32-S3**, **2000 mAh built-in, ~3-month battery** at a 6 h refresh, enclosure + buttons included, **$79**, **first-class ESPHome support with documented pins**. It's the *front-runner* (not a locked choice — board is a deferred P6 decision) because the pins and driver are *known-good and verified*, and there's no DIY battery/case work.
- Verified ESPHome essentials: board = ESP32-S3; `spi: { clk_pin: GPIO7, mosi_pin: GPIO9 }`; `display: platform: waveshare_epaper, model: 7.50inv2, cs_pin: GPIO10, dc_pin: GPIO11, reset_pin: GPIO12 (inverted:false), busy_pin: GPIO13 (inverted:true)`. If complex screens ghost, try `model: 7.50inv2alt`. Dashboards fetched via `online_image` (PNG, `type: GRAYSCALE`, `buffer_size: 65536`).
- ⚠️ Battery-ADC pin not verified — P6 leaves it as a TODO to read off Seeed's "Buttons, Buzzer, LED, Battery & Low Power" cookbook.
- LILYGO T5 4.7" (S3) stays as the cheaper DIY alternative but needs a **community external component** (`nickolay/esphome-lilygo-t547plus` or `AppForce1/...`) — more fragile, so it's plan-B only.

## Thread / 802.15.4 — does it help the display's battery? (asked during planning)

Short answer: **no**, not for the recommended display — keep it on WiFi.

- The **reTerminal E1001 is ESP32-S3** (`ESP32-S3R8`) — **WiFi 4 + BLE only, no 802.15.4 radio**, so it physically cannot join a Thread network. Only ESP32-C5/C6/H2/H4 have 802.15.4.
- **ESPHome OpenThread exists since 2025.6** but **only on ESP32-C6/H2**, and it carries the **ESPHome native API over Thread's IPv6** — built for small sensor payloads, not an `online_image` HTTP PNG fetch. A full-screen image over a ~250 kbps 802.15.4 mesh keeps the radio on *longer* than WiFi (Mbps), so it would *hurt* battery.
- A deep-sleep **wake→fetch→sleep** display is dominated by sleep current (radio-agnostic) + per-wake WiFi *association*. Thread's battery win is for *always-listening* devices, which this isn't. The levers are **static IP + fewer wakes** (see P6), not Thread.
- Where the user's existing Thread border router *does* pay off: low-power always-on **companion sensors** (cupboard temp/humidity, door, snooze button) → P9f.
- Sources: ESPHome OpenThread component + 2025.6 changelog (esphome.io); Seeed reTerminal E1001 spec (ESP32-S3R8, WiFi/BLE).

### Follow-up: would Matter-over-Thread work for the display? (no)

- **Matter has no display/image/text device type or cluster.** Its display-adjacent types are *controllers* (Echo Show, Nest Hub) and a Casting Video Player (media playback) — nothing that accepts a server-rendered dashboard bitmap. So our PNG cannot travel "over Matter" at all. (Verified against Matter device-type/cluster references, mid-2026.)
- The only Thread-native alternative: an ESP32-C6/H2 joins Thread and receives a handful of **small text values** via ESPHome's native API (Thread is explicitly *low-bandwidth, minimal-data*), then renders the layout **on-device** with a `lambda:` + fonts. Coherent, but it **moves layout off the server into the firmware** — every design tweak = reflash — which is exactly the coupling the image-based design avoids, and it caps you at simple text, not the composed dashboard.
- Battery gain is marginal anyway: WiFi + deep-sleep already idles ~99.98% of the time (~3-month battery); the fix for the per-wake WiFi cost is static IP + fewer wakes (P6), not a new radio.
- **Verdict: not worth it for the display — keep it on WiFi.** Matter/Thread is the right tool for *sensors/controls* (P9f), not a bitmap dashboard.
- Sources: Matter device types (handbook.buildwithmatter.com, matterdevices.io); ESPHome Thread guide (smarthomescene.com).

## `@resvg/resvg-js` vs `sharp`

Chose resvg-js: prebuilt napi binary for `linux-arm64-musl` (the Pi/Alpine target) exists and needs no compilation; `sharp`'s SVG rendering leans on librsvg where musl-arm64 coverage has historically been patchy. resvg-js renders our hand-built SVG string → PNG at exact panel resolution, supports `fontFiles` + `loadSystemFonts:false` for deterministic output.

## barcode-detector wasm gotcha (drives P3)

`barcode-detector` fetches its zxing `.wasm` from a CDN by default. Under a PWA's CSP and for offline use we must **self-host the wasm** and point the library at it (bundle via Vite `?url` import / `setZXingModuleOverrides`). P3 has the snippet.

---

## Deviations

*(empty — append dated entries here when reality diverges from the above. Format: `- YYYY-MM-DD (Pn): what differed, what you did.`)*

## Sources

- Node SQLite: <https://nodejs.org/api/sqlite.html>
- Open Food Facts API + limits: <https://openfoodfacts.github.io/openfoodfacts-server/api/> · <https://support.openfoodfacts.org/help/en-gb/12-api-data-reuse/94-are-there-conditions-to-use-the-api>
- HA Tailscale add-on docs: <https://github.com/hassio-addons/app-tailscale/blob/main/tailscale/DOCS.md>
- `tailscale serve`: <https://tailscale.com/kb/1242/tailscale-serve> · containers: <https://tailscale.com/kb/1282/docker>
- reTerminal E1001 ESPHome: <https://wiki.seeedstudio.com/reterminal_e10xx_with_esphome/> · product: <https://www.seeedstudio.com/reTerminal-E1001-p-6534.html>
- ESPHome online_image: <https://esphome.io/components/online_image/> · waveshare_epaper: <https://esphome.io/components/display/waveshare_epaper/>
- iOS Web Push: <https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers>
- barcode-detector: <https://github.com/Sec-ant/barcode-detector> · resvg-js: <https://github.com/thx/resvg-js>
