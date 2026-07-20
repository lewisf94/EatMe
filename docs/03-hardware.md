# 03 · Hardware

## The kitchen display

Requirements: readable at a glance, lives on a wall or shelf, no cable if possible, and cheap enough that it's a fun peripheral rather than a commitment. E-ink fits perfectly: the image persists with zero power, so the device only wakes to fetch a new screen a few times a day and can run **months on one charge**.

> **The specific board is NOT locked in — and it's deliberately cheap to defer.** You buy nothing until P6, and the display is *swappable by design*: the server renders a PNG and the firmware just fetches it, so switching boards only touches `firmware/*.yaml` and one render-resolution number — never the app, server, or data model. Treat the table below as a menu you pick from when you reach P6, not a decision you owe now. The starred row is only the best-*verified* starting point.

### Candidates

| Device | Screen | Price (ish) | Power | Effort | Notes |
|---|---|---|---|---|---|
| **Seeed reTerminal E1001** ⭐ | 7.5″ · 800×480 · 4-grey | ~$79 | Built-in 2000 mAh, **~3-month** battery | **Very low** | ESP32-S3 in a finished case with buttons; **first-class ESPHome support with documented pins**. Nothing to wire, solder or print. |
| Seeed XIAO 7.5″ ePaper Panel | 7.5″ · 800×480 · B/W | ~$50 | Built-in 2000 mAh, ~3-month | Low | Cheaper Seeed sibling (XIAO ESP32-C3); panel + battery, ESPHome-ready; less case/fewer buttons than the E1001. |
| LILYGO T5 4.7″ (S3) | 4.7″ · 960×540 · 16-grey | ~£45–55 | 18650/LiPo on-board, USB-C | Medium | Cheapest DIY board, lovely panel — but the **S3 needs a community ESPHome external component**, not a built-in driver. Plan-B. |
| Waveshare 7.5″ + ESP32 driver board | 7.5″ · 800×480 · B/W | ~£55–65 | Add your own LiPo + charger board | Medium | Biggest screen per pound; DIY battery wiring; rock-solid `waveshare_epaper` support. |
| TRMNL | 7.5″ · 800×480 · B/W | ~$139 | Built-in, months per charge | Near zero | Polished, open, self-hostable "BYOS" mode our server could implement; dearest. |
| Old Kindle / Android tablet | varies | Free if owned | Mains, realistically | Medium hack | £0 prototype (Android + Fully Kiosk on a dashboard URL); mains-tethered end state. |

### Leading candidate (not locked): Seeed reTerminal E1001

A safe default to *pencil in* — nothing more. It's a **finished device** — 7.5″ 800×480 panel, ESP32-S3, a 2000 mAh battery quoted at **~3 months** on a 6-hour refresh, buttons and a case — for ~$79, and crucially it has **first-class ESPHome support with pins Seeed documents** (verified July 2026). So the firmware in P6 would be known-good YAML, not a community-component gamble. That verification is the *only* reason it leads. If price, size, colour, or using a board you already own matters more, any row in the table works — the plan doesn't depend on which you choose.

Why not the LILYGO T5 4.7″ (the original draft pick)? Cheaper (~£50) with a lovely 16-grey panel, but the ESP32-**S3** revision needs a *community* ESPHome external component (`nickolay/esphome-lilygo-t547plus` or `AppForce1/…`) rather than a built-in driver — more moving parts for a first build. It stays a solid **plan-B**, especially if you already own one. Want to spend less? The **Seeed XIAO 7.5″ ePaper Panel** (~$50) is the same idea with fewer frills. Want zero tinkering? **TRMNL** (~$139) is polished and its self-hostable "BYOS" webhook our server could implement instead of `/api/display.png`.

### Firmware (ESPHome)

The full, verified config is written in [P6](plan/06-phase-eink-display.md) as `firmware/whattoeat-display.yaml`. Its shape for the reTerminal E1001 — pins verified against Seeed's ESPHome cookbook:

```yaml
esp32:
  board: esp32-s3-devkitc-1     # reTerminal E1001 is ESP32-S3
spi:
  clk_pin: GPIO7
  mosi_pin: GPIO9
online_image:
  - id: dashboard
    url: "http://homeassistant.local:8099/api/display.png"
    format: PNG
    type: GRAYSCALE
    buffer_size: 65536
display:
  - platform: waveshare_epaper
    model: 7.50inv2             # 7.50inv2alt if complex screens ghost
    cs_pin: GPIO10
    dc_pin: GPIO11
    reset_pin: { number: GPIO12, inverted: false }
    busy_pin: { number: GPIO13, inverted: true }
deep_sleep:
  run_duration: 45s
  sleep_duration: 6h            # ~4 wakes/day → months per charge
```

The flow: wake → Wi-Fi → download the server-rendered PNG → draw → report battery → sleep. All layout lives server-side, so the screen design can change forever without touching the device.

Mounting: a picture frame or 3D-printed stand; magnets on the fridge also work. STL links can go in `firmware/` once the board variant is in hand.

## QR labels for decanted jars

Spice jars refilled from bags have no barcode, so the app generates one per item:

- Label content: `https://<server>/i/<qrUid>` — scanning with the normal iPhone camera (or in-app) opens that jar's quick-update screen.
- **£0 route**: `GET /api/labels` renders a sheet of QR codes sized ~19 mm with names underneath; print on paper, attach with clear tape over the lid. Survives kitchens surprisingly well.
- **£20 route**: a Niimbot D110 thermal label printer prints proper adhesive labels from its phone app (the sheet renders each QR as an image to send to it). Nicer, entirely optional.
- Stretch: NTAG213 NFC stickers (~£5 for 10) — tap the phone on the lid instead of scanning. iPhones read NFC tags natively; the tag just stores the same URL.

## The server: already owned

No purchase needed — the existing Raspberry Pi running Home Assistant OS hosts the add-on (see [architecture](02-architecture.md#ha-add-on-packaging)). Any Pi 4/5 with a few hundred MB of headroom is ample: the stack is one Node process and a SQLite file; the heaviest thing it ever does is rasterise one 800×480 PNG a few times a day.

## Shopping list (the hardware one)

| Item | Cost | Needed for |
|---|---|---|
| Seeed reTerminal E1001 (or XIAO 7.5″ ~$50) | ~$79 | P6 (display) |
| USB-C cable for flashing/charging | ~£0 (drawer) | P6 |
| Niimbot D110 + labels *(optional)* | ~£20 | P5 nicety |
| NTAG213 NFC stickers *(optional)* | ~£5 | P9 |

Nothing needs ordering until P6 — the display comes after the app is already useful on its own. The reTerminal is all-in-one, so it's the only display purchase (no separate battery/case).

---

Next: [04 · Roadmap](04-roadmap.md)
