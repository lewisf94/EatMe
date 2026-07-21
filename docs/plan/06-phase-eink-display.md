# P6 · E-ink kitchen display

**Goal:** a battery e-ink screen in the kitchen showing the top "eat me first" items (and, once P7 exists, a use-it-up recipe). The server renders the whole image; the device is dumb — it wakes a few times a day, downloads a PNG, draws it, and deep-sleeps.

**Prerequisites:** P1 green (needs items + status). Nicer after P7 (recipe line). Hardware verification is 🖐.

## Hardware — chosen build (still swappable)

**Chosen (Lewis): a DIY low-power build** — **Seeed XIAO ESP32-C3** + **Waveshare 4.2″ e-paper (400×300, B/W)**, powered by **solar + a LiPo backup + USB-C top-up**. The XIAO has USB-C and a TP4056 LiPo charger built in, so "backup battery + USB-C" needs no extra parts; its ~44–80 µA deep sleep suits the solar/never-recharge goal, and it's tiny and cheap. The mounting spot has **average room light**, so solar assists and stretches battery life but won't be infinite indoors — the LiPo + USB-C are the backstop (see [hardware doc → Powering it](../03-hardware.md)).

**Still swappable.** The server/API/data model are display-agnostic; changing board or panel touches only this file's `firmware/*.yaml` and the `DISPLAY_W`/`DISPLAY_H` render constants (**400×300** for the 4.2″). A finished board (Inkplate 6, or the reTerminal E1001 whose config is kept below) is a drop-in swap. Hardware verification is 🖐.

## Deliverables

1. `services/display.ts` — builds an SVG dashboard string.
2. `GET /api/display.png` — renders that SVG → **400×300** grayscale PNG via `@resvg/resvg-js` (size from `DISPLAY_W`/`DISPLAY_H`).
3. `firmware/eatme-display.yaml` — ESPHome config for the **DIY XIAO ESP32-C3 + Waveshare 4.2″** (below; reTerminal E1001 kept as a finished-board alternative). Keep the render size in a single `DISPLAY_W`/`DISPLAY_H` constant so a board/panel swap is a one-line change.
4. Optional device auth: `?token=` checked against `DISPLAY_TOKEN` (so the display endpoint stays reachable even when `AUTH_TOKEN` is on).

## Server: render pipeline (SVG → PNG)

`@resvg/resvg-js` renders our own SVG string — no browser, fast, deterministic, and it has a prebuilt musl-arm64 binary for the Pi.

```ts
// services/display.ts
import { Resvg } from "@resvg/resvg-js";

const DISPLAY_W = 400, DISPLAY_H = 300;   // Waveshare 4.2″; change with the panel

export function buildDashboardSvg(data: {
  urgent: { name: string; sub: string }[];   // top 4 by urgency (fits 400×300)
  recipe?: string;                             // from P7, optional
  lowStock: number;
  battery?: number;                            // reported by the device
  rendered: string;                            // e.g. "Sun 20 Jul, 08:00"
}): string {
  // 400x300. BIG legible type — a 4.2″ panel at arm's length holds ~4 lines + a footer.
  // Title row, up to 4 urgent lines "name — sub" (sub = "use in 2 days" / "opened 8mo"),
  // a footer with recipe or low-stock count + battery% + rendered time.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${DISPLAY_W}" height="${DISPLAY_H}"> … </svg>`; // TODO(impl)
}

export function renderPng(svg: string): Buffer {
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: DISPLAY_W },
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
- `gatherDashboardData()` reuses the P1 items+status query (urgency sort). On a 400×300 panel show the **top 4** items in large type + a footer (recipe once P7 exists, else low-stock count) — glanceability beats density on a 4.2″. `recipe` stays undefined until P7 wires it.
- Keep the PNG grayscale-friendly (black text on white, no anti-alias-dependent thin strokes); the panel is 4-level grey.

## Firmware: `firmware/eatme-display.yaml`

**DIY build: XIAO ESP32-C3 + Waveshare 4.2″ (400×300).** The SPI/CS/DC/BUSY/RESET pins are **your wiring choice** — the values below are a sensible XIAO mapping (hardware SPI is SCK=`GPIO8`/D8, MOSI=`GPIO10`/D10; the rest are any free GPIO). Match them to how you solder the panel. **Flash via the ESPHome dashboard in HA.**

```yaml
esphome:
  name: eatme-display
esp32:
  board: esp32-c3-devkitm-1       # XIAO ESP32-C3; the ESPHome XIAO-C3 preset also works
  framework:
    type: esp-idf

logger:
  baud_rate: 0                    # frees the UART pins; trims a little power
wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
  # manual_ip: {...}              # static IP → skip DHCP each wake (see Battery notes)

http_request:
  timeout: 15s

spi:
  clk_pin: GPIO8                  # XIAO D8 (SCK)
  mosi_pin: GPIO10                # XIAO D10 (MOSI)

online_image:
  - id: dashboard
    url: "http://homeassistant.local:8099/api/display.png"   # LAN http is fine (no secure-context rule)
    format: PNG
    type: GRAYSCALE
    buffer_size: 30000            # 400×300 needs far less than the 7.5″
    update_interval: 30s          # fires once during the wake window
    on_download_finished:
      then:
        - component.update: epaper_display

display:
  - platform: waveshare_epaper
    id: epaper_display
    model: 4.20in                 # Waveshare 4.2″ B/W 400×300 (SPI mode 0); also 4.20inV2
    cs_pin: GPIO4                 # ↓ these four are wiring choices — any free GPIO
    dc_pin: GPIO5
    busy_pin: GPIO6
    reset_pin: GPIO7
    update_interval: never        # updated explicitly on_download_finished
    lambda: |-
      it.image(0, 0, id(dashboard));

# LiPo %: XIAO has no fuel gauge — read the cell through a 2×100k divider on an ADC pin
# and report it to the server:
#   sensor: - platform: adc  pin: GPIO2  ...  on_value → http_request.get
#           url: http://homeassistant.local:8099/api/display.png?battery={{ x }}

deep_sleep:
  id: deep_sleep_1
  run_duration: 45s               # awake long enough to fetch + draw
  sleep_duration: 24h             # once/day (your call) — see Battery notes
```
> ⚠️ Verify against **current ESPHome docs** at build time: the `online_image` trigger name (`on_download_finished`) and whether an explicit download action is needed; the exact XIAO-C3 `board:` id; and the `4.20in` model string (there's `4.20inV2` and a `4.20in-bV2` BWR variant — use the plain B/W one). The SPI/CS/DC/BUSY/RESET pins are **wiring choices**, not fixed — set them to your solder job. Record anything different in research-notes.
>
> If `deep_sleep` + `online_image` timing is racy (screen draws before the download lands), switch to an explicit `on_boot` script: `online_image.update` → wait for `on_download_finished` → `component.update` → `deep_sleep.enter`. Note which pattern worked.

<details><summary><b>Alternative — finished board: reTerminal E1001</b> (ESP32-S3, 7.5″ 800×480, verified pins, no soldering; set <code>DISPLAY_W/H = 800/480</code> and <code>buffer_size: 65536</code>).</summary>

```yaml
esp32:
  board: esp32-s3-devkitc-1       # reTerminal E1001 is ESP32-S3
psram:                            # S3 has PSRAM; online_image needs the buffer
spi: { clk_pin: GPIO7, mosi_pin: GPIO9 }
display:
  - platform: waveshare_epaper
    id: epaper_display
    model: 7.50inv2               # try 7.50inv2alt if complex screens ghost
    cs_pin: GPIO10
    dc_pin: GPIO11
    reset_pin: { number: GPIO12, inverted: false }
    busy_pin: { number: GPIO13, inverted: true }
    update_interval: never
    lambda: 'it.image(0, 0, id(dashboard));'
# battery ADC pin per Seeed's "Buttons, Buzzer, LED, Battery & Low Power" cookbook.
```
</details>

`firmware/secrets.yaml.example` documents `wifi_ssid`/`wifi_password` (real `secrets.yaml` git-ignored).

### Battery & networking — keep it on WiFi (and why not Thread)

Battery life is set by the XIAO's deep sleep (~44–80 µA). On a ~1000–1500 mAh LiPo (the XIAO's TP4056 charger tops out around 1500 mAh) at once/day, that's roughly **~10–18 months on the LiPo alone**, before any solar — and average-room-light solar stretches it further, with USB-C as the rare backstop. Two free levers help too:

- **Static IP** — set `manual_ip:` in the `wifi:` block so the device skips DHCP on every wake. DHCP negotiation is usually the biggest slice of wake time, so this is the largest easy win. Also consider `fast_connect: true` and pinning `bssid:`/`channel:` to skip the scan.
- **Fewer wakes** — food expiry moves slowly; `sleep_duration: 12h` (2×/day) roughly halves radio energy vs 6 h and is plenty for a cupboard.
- **Chosen power direction: solar + LiPo backup + USB-C top-up** (see "Powering it" in the [hardware doc](../03-hardware.md)). The load is tiny enough that solar sustains it indefinitely; the LiPo buffers dark spells; USB-C is the fallback. Deep-sleep current dominates, so a **lean board** (Inkplate ~20 µA, ESP32-C3 ~5 µA) matters far more than wake rate — the reTerminal (~0.9 mA) is sleep-limited and not the pick for this.

**Thread does not help this display** (verified — see the Thread section in [research-notes](research-notes.md)): our board (ESP32-C3, like the -S3) has **no 802.15.4 radio**, so it can't join Thread; and even on a C6/H2, ESPHome carries only its native API over Thread — pulling a full-screen PNG over a ~250 kbps mesh would keep the radio on *longer* than WiFi. A wake→fetch→sleep device is dominated by sleep current + WiFi association, which static IP addresses directly. Thread's advantage is for always-listening sensors → see [P9f](09-phase-stretch.md).

## Acceptance checklist

- [ ] `pnpm check` green.
- [ ] `GET /api/display.png` returns a valid PNG **exactly 400×300** (verify: `curl -s localhost:8099/api/display.png -o /tmp/d.png && file /tmp/d.png` shows `400 x 300`). Open it — the four most-urgent items are legible at a glance.
- [ ] With `DISPLAY_TOKEN` set, the endpoint 401s without `?token=` and serves with it.
- [ ] Output renders with the **bundled font** (delete system fonts assumption: it works in the P4 container where no system fonts exist).
- [ ] `?battery=42` persists and shows on the next render.
- [ ] 🖐 Flash `firmware/eatme-display.yaml` to the XIAO ESP32-C3 (wired to the Waveshare 4.2″) via the HA ESPHome dashboard; it shows the dashboard, refreshes on its wake cycle, and reports LiPo % into HA.

## Definition of done

The kitchen display works end-to-end (server render proven automatically; device proven by Lewis). Commit `P6: e-ink display renderer + ESPHome firmware`. **Stop.**
