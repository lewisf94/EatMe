# 03 · Hardware

## The kitchen display

Requirements: readable at a glance, lives on a wall or shelf, no cable if possible, and cheap enough that it's a fun peripheral rather than a commitment. E-ink fits perfectly: the image persists with zero power, so the device only wakes to fetch a new screen a few times a day and can run **months on one charge**.

### Candidates

| Device | Screen | Price (ish) | Power | Effort | Notes |
|---|---|---|---|---|---|
| **LILYGO T5 4.7″ e-paper** ⭐ | 4.7″ · 960×540 · 16-grey | ~£45–55 | 18650 cell or LiPo (holder/connector on board, USB-C charging) | Low | ESP32 + panel + battery management on one board; big community trail of weather/dashboard builds; ESPHome support |
| Waveshare 7.5″ e-Paper + ESP32 driver board | 7.5″ · 800×480 · B/W | ~£55–65 | Add your own LiPo + charger board | Medium | Biggest screen per pound; two-part kit, DIY battery wiring; rock-solid ESPHome `waveshare_epaper` support |
| TRMNL | 7.5″ · 800×480 · B/W | ~$139 | Built-in, months per charge | Near zero | Polished product with case; open firmware and a self-hostable "BYOS" server mode our server could implement; least tinkering, most money |
| M5Paper S3 | 4.7″ · 960×540 · touch | ~£75 | Built-in 1150 mAh | Low–medium | Nice case and touch, but touch is wasted here (display is read-only) and it's dearer |
| Old Kindle / Android tablet | varies | Free if owned | Mains, realistically | Medium hack | Kindle needs jailbreaking; Android runs Fully Kiosk pointed at a dashboard URL. Great £0 prototype, worse end state |

### Recommendation: LILYGO T5 4.7″

Cheapest all-in-one option, the 960×540 panel comfortably fits five "eat me first" lines plus a recipe suggestion, and — the clincher given Home Assistant is already in the house — it runs **ESPHome**, so the firmware is YAML managed from the existing ESPHome dashboard, not C++ to write and maintain.

Buying notes: sold by LILYGO's official AliExpress store (cheapest) or Amazon UK (faster, ~£10 more). Two board generations exist — original ESP32 and newer **ESP32-S3**. The original has the longest ESPHome track record with the `lilygo_t5_47` display component; the S3 revision works too on current ESPHome but check the docs/forums at build time for the right board config. Add an 18650 cell (~£8, from a UK seller with genuine cells) if the board variant takes one, otherwise a 1000–2000 mAh LiPo with a JST-PH plug.

If tinkering appeal fades: buy a TRMNL instead and implement its BYOS webhook in our server — the display side becomes a solved product and `/api/display.png` just changes shape slightly.

### Firmware sketch (ESPHome)

Full config lands in `firmware/` during P4; the shape of it:

```yaml
esphome:
  name: whattoeat-display

esp32:
  board: esp32-s3-devkitc-1   # set per purchased board variant (S3 vs original)
  framework:
    type: esp-idf

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

http_request:

online_image:
  - id: dashboard
    url: http://homeassistant.local:8099/api/display.png?panel=t547
    format: PNG
    type: GRAYSCALE
    update_interval: never          # fetched explicitly after each wake

display:
  - platform: lilygo_t5_47
    id: epaper
    lambda: |-
      it.image(0, 0, id(dashboard));

sensor:
  - platform: adc                   # battery voltage → % reported to HA
    # pin/attenuation per board variant

deep_sleep:
  sleep_duration: 6h                # wake ~4×/day; display persists while asleep

# on boot: connect → download dashboard → refresh display → enter deep sleep
```

The flow is: wake → Wi-Fi → download the server-rendered PNG → draw → report battery → sleep. All layout decisions live server-side, so the screen design can change forever without touching the device. At four wakes a day of ~30 seconds each, a 2500 mAh 18650 realistically gives **several months** between charges; charging is plugging in a USB-C cable where it hangs.

Mounting: a picture frame or 3D-printed stand; magnets on the fridge also work. STL links can go in `firmware/` once the board variant is in hand.

## QR labels for decanted jars

Spice jars refilled from bags have no barcode, so the app generates one per item:

- Label content: `https://<server>/i/<qrUid>` — scanning with the normal iPhone camera (or in-app) opens that jar's quick-update screen.
- **£0 route**: `GET /api/labels` renders a sheet of QR codes sized ~19 mm with names underneath; print on paper, attach with clear tape over the lid. Survives kitchens surprisingly well.
- **£20 route**: a Niimbot D110 thermal label printer prints proper adhesive labels from its phone app (the sheet renders each QR as an image to send to it). Nicer, entirely optional.
- Stretch: NTAG213 NFC stickers (~£5 for 10) — tap the phone on the lid instead of scanning. iPhones read NFC tags natively; the tag just stores the same URL.

## The server: already owned

No purchase needed — the existing Raspberry Pi running Home Assistant OS hosts the add-on (see [architecture](02-architecture.md#ha-add-on-packaging)). Any Pi 4/5 with a few hundred MB of headroom is ample: the stack is one Node process and a SQLite file; the heaviest thing it ever does is rasterise one 960×540 PNG a few times a day.

## Shopping list (the hardware one)

| Item | Cost | Needed for |
|---|---|---|
| LILYGO T5 4.7″ e-paper board | ~£50 | P4 (display) |
| 18650 cell or LiPo (per board variant) | ~£8 | P4 |
| USB-C cable for flashing/charging | ~£0 (drawer) | P4 |
| Niimbot D110 + labels *(optional)* | ~£20 | P3 nicety |
| NTAG213 NFC stickers *(optional)* | ~£5 | P7 |

Nothing needs ordering before P4 — the display is deliberately the fourth phase, after the app is already useful on its own.

---

Next: [04 · Roadmap](04-roadmap.md)
