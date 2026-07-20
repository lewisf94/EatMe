# P6 · E-ink kitchen display

**Goal:** a battery e-ink screen in the kitchen showing the top "eat me first" items (and, once P7 exists, a use-it-up recipe). The server renders the whole image; the device is dumb — it wakes a few times a day, downloads a PNG, draws it, and deep-sleeps.

**Prerequisites:** P1 green (needs items + status). Nicer after P7 (recipe line). Hardware verification is 🖐.

## Hardware — pick at the start of this phase (not pre-committed)

**The board is a P6 decision, and it's swappable.** The server/API/data model are display-agnostic; a different board changes only this file's `firmware/*.yaml` and the render resolution constant (`DISPLAY_W`/`DISPLAY_H`, default 800×480). So don't treat any board as fixed — confirm Lewis's actual choice before ordering, then adjust the two knobs.

Front-runner (best-verified, see [research-notes](research-notes.md) + [hardware doc](../03-hardware.md)): **Seeed reTerminal E1001** — 7.5″ mono, **800×480**, ESP32-S3, built-in 2000 mAh (~3-month battery @ 6 h refresh), enclosure + buttons, ~$79, official ESPHome support with documented pins. The YAML below targets it. Other viable picks: Seeed XIAO 7.5″ (~$50, ESP32-C3), Waveshare 7.5″ + ESP32 (DIY), LILYGO T5 4.7″ (960×540, needs a community ESPHome component), or a colour panel (then also switch the renderer from grayscale — see below). Hardware verification is 🖐.

## Deliverables

1. `services/display.ts` — builds an SVG dashboard string.
2. `GET /api/display.png` — renders that SVG → 800×480 grayscale PNG via `@resvg/resvg-js`.
3. `firmware/whattoeat-display.yaml` — ESPHome config for the chosen board (front-runner config below is for the reTerminal E1001). Keep the render size in a single `DISPLAY_W`/`DISPLAY_H` constant so a board swap is a one-line change.
4. Optional device auth: `?token=` checked against `DISPLAY_TOKEN` (so the display endpoint stays reachable even when `AUTH_TOKEN` is on).

## Server: render pipeline (SVG → PNG)

`@resvg/resvg-js` renders our own SVG string — no browser, fast, deterministic, and it has a prebuilt musl-arm64 binary for the Pi.

```ts
// services/display.ts
import { Resvg } from "@resvg/resvg-js";

export function buildDashboardSvg(data: {
  urgent: { name: string; sub: string }[];   // top 5 by urgency
  recipe?: string;                             // from P7, optional
  lowStock: number;
  battery?: number;                            // reported by the device
  rendered: string;                            // e.g. "Sun 20 Jul, 08:00"
}): string {
  // 800x480. Big legible type (e-ink is low-DPI at arm's length).
  // Title row, up to 5 urgent lines "name — sub" (sub = "use in 2 days" / "opened 8mo"),
  // a footer with recipe or low-stock count + battery% + rendered time.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480"> … </svg>`; // TODO(impl)
}

export function renderPng(svg: string): Buffer {
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: 800 },
    font: { loadSystemFonts: false, fontFiles: [/* bundle one .ttf under apps/server/assets */], defaultFontFamily: "Inter" },
  });
  return r.render().asPng();
}
```

```ts
// routes/display.ts
app.get("/api/display.png", async (req, reply) => {
  if (config.displayToken && req.query.token !== config.displayToken)
    return reply.code(401).send();
  if (typeof req.query.battery === "string") saveBattery(Number(req.query.battery)); // device reports %
  const svg = buildDashboardSvg(await gatherDashboardData());
  reply.type("image/png").header("Cache-Control", "no-store").send(renderPng(svg));
});
```
- Bundle a TTF (e.g. Inter) under `apps/server/assets/` and reference it via `fontFiles` with `loadSystemFonts:false` so output is identical on the Pi (which has no fonts). Copy `assets/` into the container in P4's Dockerfile if not already.
- `gatherDashboardData()` reuses the P1 items+status query (urgency sort, take 5). `recipe` stays undefined until P7 wires it.
- Keep the PNG grayscale-friendly (black text on white, no anti-alias-dependent thin strokes); the panel is 4-level grey.

## Firmware: `firmware/whattoeat-display.yaml`

Verified pins for the reTerminal E1001. **Flash via the ESPHome dashboard already in HA.**

```yaml
esphome:
  name: whattoeat-display
esp32:
  board: esp32-s3-devkitc-1      # reTerminal E1001 is ESP32-S3; adjust if the ESPHome wizard picks another S3 board id
  framework:
    type: esp-idf

logger:
wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

psram:                            # S3 module has PSRAM; online_image needs the buffer

http_request:
  timeout: 15s

spi:
  clk_pin: GPIO7
  mosi_pin: GPIO9

online_image:
  - id: dashboard
    url: "http://homeassistant.local:8099/api/display.png"   # LAN http is fine for ESPHome (no secure-context rule)
    format: PNG
    type: GRAYSCALE
    buffer_size: 65536
    update_interval: 30s          # fires once during the wake window
    on_download_finished:
      then:
        - component.update: epaper_display

display:
  - platform: waveshare_epaper
    id: epaper_display
    model: 7.50inv2               # try 7.50inv2alt if complex screens ghost
    cs_pin: GPIO10
    dc_pin: GPIO11
    reset_pin:
      number: GPIO12
      inverted: false
    busy_pin:
      number: GPIO13
      inverted: true
    update_interval: never        # updated explicitly on_download_finished
    lambda: |-
      it.image(0, 0, id(dashboard));

# battery %: reTerminal exposes a battery ADC — pin/divider TODO from Seeed's
# "Buttons, Buzzer, LED, Battery & Low Power" cookbook. Report it to the server:
#   sensor: - platform: adc  ... then an http_request.get to /api/display.png?battery={{x}}

deep_sleep:
  id: deep_sleep_1
  run_duration: 45s               # awake long enough to fetch + draw
  sleep_duration: 6h              # ~4 wakes/day → months per charge
```
> ⚠️ Verify against **current ESPHome docs** at build time: the exact `online_image` trigger name (`on_download_finished`) and whether an explicit `online_image.update`/download action is needed, and the S3 `board:` id the wizard assigns. The reTerminal cookbook uses this `waveshare_epaper` `7.50inv2` driver — trust the pins, re-check the trigger/action spelling. Record anything different in research-notes.
>
> If `deep_sleep` + `online_image` timing is racy (screen draws before the download lands), switch to an explicit boot script: `on_boot` → `online_image.update` → wait for `on_download_finished` → `component.update` → `deep_sleep.enter`. Note which pattern worked.

`firmware/secrets.yaml.example` documents `wifi_ssid`/`wifi_password` (real `secrets.yaml` git-ignored).

### Battery & networking — keep it on WiFi (and why not Thread)

The reTerminal is quoted at ~3 months (2000 mAh, 6 h refresh) over WiFi. Two free levers extend that:

- **Static IP** — set `manual_ip:` in the `wifi:` block so the device skips DHCP on every wake. DHCP negotiation is usually the biggest slice of wake time, so this is the largest easy win. Also consider `fast_connect: true` and pinning `bssid:`/`channel:` to skip the scan.
- **Fewer wakes** — food expiry moves slowly; `sleep_duration: 12h` (2×/day) roughly halves radio energy vs 6 h and is plenty for a cupboard.
- **Never-recharge / solar** — the load is tiny enough to run indefinitely off a small solar panel + LiFePO4 (or for years off a big primary cell). Deep-sleep current dominates, so a **lean board** (Inkplate ~20 µA, ESP32-C3 ~5 µA) matters far more than wake rate — the reTerminal (~0.9 mA) is sleep-limited. See "Powering it" in the [hardware doc](../03-hardware.md).

**Thread does not help this display** (verified — see the Thread section in [research-notes](research-notes.md)): the reTerminal is an **ESP32-S3 with no 802.15.4 radio**, so it can't join Thread; and even on a C6/H2, ESPHome carries only its native API over Thread — pulling a full-screen PNG over a ~250 kbps mesh would keep the radio on *longer* than WiFi. A wake→fetch→sleep device is dominated by sleep current + WiFi association, which static IP addresses directly. Thread's advantage is for always-listening sensors → see [P9f](09-phase-stretch.md).

## Acceptance checklist

- [ ] `pnpm check` green.
- [ ] `GET /api/display.png` returns a valid PNG **exactly 800×480** (verify: `curl -s localhost:8099/api/display.png -o /tmp/d.png && file /tmp/d.png` shows `800 x 480`). Open it — the five most-urgent items are legible.
- [ ] With `DISPLAY_TOKEN` set, the endpoint 401s without `?token=` and serves with it.
- [ ] Output renders with the **bundled font** (delete system fonts assumption: it works in the P4 container where no system fonts exist).
- [ ] `?battery=42` persists and shows on the next render.
- [ ] 🖐 Flash `firmware/whattoeat-display.yaml` to your chosen board (front-runner: reTerminal E1001) via the HA ESPHome dashboard; it shows the dashboard, refreshes on its wake cycle, and reports battery % into HA.

## Definition of done

The kitchen display works end-to-end (server render proven automatically; device proven by Lewis). Commit `P6: e-ink display renderer + ESPHome firmware`. **Stop.**
