# 03 · Hardware

## The kitchen display

Requirements: readable at a glance, lives on a wall or shelf, no cable if possible, and cheap enough that it's a fun peripheral rather than a commitment. E-ink fits perfectly: the image persists with zero power, so the device only wakes to fetch a new screen a few times a day and can run **months on one charge**.

The display remains swappable by design: the server renders a PNG and the
firmware fetches it, so changing hardware affects the firmware and render
resolution rather than the inventory data model. The current component research
and purchasing recommendation are in the
[e-paper hardware research](05-hardware-research.md).

### Finished-device alternatives

| Device | Screen | Price (ish) | Power | Effort | Notes |
|---|---|---|---|---|---|
| **Seeed reTerminal E1001** | 7.5″ · 800×480 · 4-grey | ~$79 | Built-in 2000 mAh, **~3-month** battery | **Very low** | ESP32-S3 in a finished case with buttons; **first-class ESPHome support with documented pins**. Nothing to wire, solder or print. |
| Seeed XIAO 7.5″ ePaper Panel | 7.5″ · 800×480 · B/W | ~$50 | Built-in 2000 mAh, ~3-month | Low | Cheaper Seeed sibling (XIAO ESP32-C3); panel + battery, ESPHome-ready; less case/fewer buttons than the E1001. |
| LILYGO T5 4.7″ (S3) | 4.7″ · 960×540 · 16-grey | ~£45–55 | 18650/LiPo on-board, USB-C | Medium | Cheapest DIY board, lovely panel — but the **S3 needs a community ESPHome external component**, not a built-in driver. Plan-B. |
| Waveshare 7.5″ + ESP32 driver board | 7.5″ · 800×480 · B/W | ~£55–65 | Add your own LiPo + charger board | Medium | Biggest screen per pound; DIY battery wiring; rock-solid `waveshare_epaper` support. |
| **Inkplate 6 / 10** (Soldered) | 6″ 800×600 / 9.7″ 1200×825 · grey | ~$150 / ~$210 | Built-in LiPo charging; **~18–25 µA sleep** | Low | **Low-power champion** — native ESPHome, trivial to add solar/LiFePO4. Dearer, but a year+ on battery, or solar-forever. |
| TRMNL | 7.5″ · 800×480 · B/W | ~$139 | Built-in, months per charge | Near zero | Polished, open, self-hostable "BYOS" mode our server could implement; dearest. |
| Old Kindle / Android tablet | varies | Free if owned | Mains, realistically | Medium hack | £0 prototype (Android + Fully Kiosk on a dashboard URL); mains-tethered end state. |

### Current component recommendation

The first prototype uses the existing **Tenstar Robot ESP32-C6 Super Mini** and
a **Waveshare Pico-ePaper-4.2 black/white 400 x 300 display**. The Pico header is
optional because the module also exposes a standard SPI connector. This panel
matches EatMe's current 400 x 300 server render without an application change.

For a refined build, the **Seeed XIAO ESP32-C6** is the best compact controller.
The original **DFRobot FireBeetle ESP32 DFR0478** is the strongest battery-life
alternative: it is advertised at 10 uA and an independent test reported 11 uA,
but it is much larger and uses Micro-USB. The **FireBeetle 2 ESP32-E DFR0654**
adds USB-C, more I/O and a display connector, but its 10 uA retailer claim
conflicts with current DFRobot documentation and it requires a low-power jumper
to be cut. Measure the exact board revision before choosing it.

Seeed specifies 15 uA complete-board deep sleep for its XIAO C6 and 44 uA for
its XIAO C3. This is why the board design, rather than the C3/C6 chip label,
drives the recommendation.

The preferred refined display is the **Waveshare 3.97-inch black/white
800 x 480 HAT+**. It is sharper and physically compact, but requires an
800 x 480 EatMe render profile. The 4.26-inch 800 x 480 Waveshare panel is the
larger alternative.

### Powering the display

The prototype power path is:

```text
Voltaic P123 6 V panel
  -> Adafruit bq25185 solar charger with 5 V boost
  -> protected 2,000 mAh LiPo
  -> isolated 5 V output
  -> ESP32 controller and e-paper display
```

The bq25185 is the only battery charger. Leave the Tenstar battery pads unused,
and isolate the external 5 V link before programming the controller over USB.
Do not connect two charger outputs to the same cell.

The 66 x 66 mm, 0.64 W Voltaic P123 is the preferred bright-window panel because
it fits inside the 4.2-inch module's footprint. A P122 is smaller but offers less
poor-light margin; a P124 produces more power but extends beyond the display.

Ordinary room light needs an indoor-optimised photovoltaic cell. A 50 x 50 mm
Epishine cell produces about 175 uW at 200 lux, which is unlikely to sustain the
complete device after conversion losses. Solar remains **solar-assisted** until
the complete system has been measured through a winter at the real mounting
position.

See the [e-paper hardware research](05-hardware-research.md) for the component
matrices, primary sources, safe wiring and validation thresholds.

## QR labels for decanted jars

Spice jars refilled from bags have no barcode, so the app generates one per item:

- Label content: `https://<server>/i/<qrUid>` — scanning with the normal iPhone camera (or in-app) opens that jar's quick-update screen.
- **£0 route**: `GET /api/labels` renders a sheet of QR codes sized ~19 mm with names underneath; print on paper, attach with clear tape over the lid. Survives kitchens surprisingly well.
- **Adhesive route**: print the generated A4 sheet on full-sheet self-adhesive paper. EatMe does not currently control a Bluetooth label printer directly, and the Niimbot D110's 10–15 mm labels are smaller than the current ~19 mm QR cells.
- Stretch: NTAG213 NFC stickers (~£5 for 10) — tap the phone on the lid instead of scanning. iPhones read NFC tags natively; the tag just stores the same URL.

## The server: already owned

No purchase needed — the existing Raspberry Pi running Home Assistant OS hosts the add-on (see [architecture](02-architecture.md#ha-add-on-packaging)). Any Pi 4/5 with a few hundred MB of headroom is ample: the stack is one Node process and a SQLite file; the heaviest thing it ever does is rasterise one 800×480 PNG a few times a day.

## Shopping list

The current buy-this list and wiring table are in the
[hardware parts list](parts-list.md). The broader board, display and solar
comparison is in the [e-paper hardware research](05-hardware-research.md).

---

Next: [04 · Roadmap](04-roadmap.md)
