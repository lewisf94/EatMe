# Hardware parts list

Everything EatMe can use, and what each part is actually for. **Nothing here is
required to run the app** — the server and phone app are complete on their own.
Each section below is an optional peripheral you can add whenever you feel like
it.

> **Prices are indicative only** (rough UK street prices, and they move). Check
> the current price before ordering — they're here to show the order of
> magnitude, not to be quoted.

## Summary

| Build | Cost | Status |
|---|---|---|
| **Server** — Raspberry Pi running Home Assistant OS | — | ✅ already owned |
| **Phone** — iPhone (or any modern phone) | — | ✅ already owned |
| **QR labels** (P5) — printer + adhesive paper | ~£5–10 for paper | Uses any printer you have |
| **E-ink display** (P6) — XIAO ESP32-C3 + Waveshare 4.2″ | ~£45–60 all in | Needs ordering + soldering |
| **NFC tags** (stretch) — NTAG213 stickers | ~£5–8 | Optional, not yet implemented |

---

## 1. Server — already owned

No purchase needed. The add-on runs on the existing **Raspberry Pi with Home
Assistant OS**.

| Requirement | Why |
|---|---|
| Pi 4 or Pi 5 | The stack is one Node process + a SQLite file |
| **4 GB RAM or more** *(recommended)* | Only matters if you run the **EatMe OCR** app for real receipt scanning — Tesseract is the heaviest thing on the box. The app itself is happy in a few hundred MB. |
| A few hundred MB of disk | Database, plus the container image |

The heaviest recurring work is rasterising one 400×300 PNG for the display a few
times a day.

## 2. QR labels (P5 — shipped)

Spice jars refilled from bags have no barcode, so EatMe generates a QR label per
container. Scanning it with the normal iPhone camera opens that jar's quick-update
screen.

**The app renders an A4 sheet** (`GET /api/labels`) — a 3-column grid of 58 × 30 mm
labels, each with a 25 mm QR code. So you need a printer, and that's it.

| Item | Cost | Notes |
|---|---|---|
| **Any A4 printer** | — | Inkjet or laser, colour not needed — QR codes are black and white |
| **A4 full-sheet adhesive paper** | ~£5–10 for 20–50 sheets | The neat option: print, then cut the labels out. Sometimes sold as "full sheet labels" or "A4 sticky-back paper". |
| *or* plain paper + clear tape | ~£0 | The £0 route. Tape over the label also waterproofs it, which matters in a kitchen. |

> **Avoid pre-cut die-cut label sheets** (Avery-style, e.g. 21-per-page). The
> sheet uses a flowing CSS grid, so labels won't line up with pre-cut positions.
> Full-sheet adhesive paper (one big sticker you cut yourself) is the right
> match.

**Optional upgrade — thermal label printer:** a Niimbot D110 (~£20) prints proper
adhesive labels with no cutting. Not integrated — you'd screenshot/save each QR
and send it via the Niimbot app. Genuinely optional; the A4 sheet works well.

## 3. E-ink kitchen display (P6 — shipped, needs building)

A battery panel on the kitchen wall showing the four most urgent items. The
server renders the whole image, so the device is dumb: wake → download PNG →
draw → sleep. **This is the only part that needs soldering.**

The firmware in [`firmware/eatme-display.yaml`](../firmware/eatme-display.yaml)
targets this exact combination:

### Core parts

| # | Item | Cost | Notes |
|---|---|---|---|
| 1 | **Seeed XIAO ESP32-C3** | ~£5–8 | The specific board the firmware targets. Has USB-C **and a built-in LiPo charger**, which is why no separate charging board is needed. |
| 2 | **Waveshare 4.2″ e-Paper Module — 400×300, black/white** | ~£25–32 | ⚠️ See the warnings below — the variant matters a lot. |
| 3 | **LiPo battery, 1000–1500 mAh**, single cell (3.7 V) | ~£8–12 | The XIAO's charger tops out around 1500 mAh — don't go bigger. Estimated **~10–18 months per charge** at one wake/day. |
| 4 | **2 × 100 kΩ resistors** | ~£1 (bag of 100) | Voltage divider so the board can read the battery level (firmware reads it on GPIO2) and report the % to the server. |
| 5 | **Hook-up wire / jumper wires** | ~£3–5 | 8 connections between board and panel. |
| 6 | USB-C cable | ~£0 | For flashing and top-up charging. You have one. |

**Core total: roughly £45–60.**

### ⚠️ Getting the right e-paper panel

Waveshare sells several 4.2″ variants and they are **not** interchangeable:

- ✅ **Buy: "4.2inch e-Paper Module"** — black/white, 400×300, SPI. The
  *Module* includes the driver board (the bare *panel* alone won't work without
  a separate driver HAT).
- ❌ **Not the "B" or "C" variants** (`4.2inch e-Paper Module B`) — those are
  three-colour red/black/white, a different driver, and slower to refresh.
- ⚠️ **V2 revision**: fine, but you may need to change one line in the firmware
  from `model: 4.20in` to `model: 4.20inV2` if the screen ghosts. The firmware
  comments call this out.

### Wiring (8 connections)

The firmware's pin choices — you can change them, they're just free GPIOs, but
these match the file as written:

| Panel pin | XIAO pin | Note |
|---|---|---|
| VCC | 3V3 | |
| GND | GND | |
| DIN (MOSI) | GPIO10 (D10) | Hardware SPI |
| CLK (SCK) | GPIO8 (D8) | Hardware SPI |
| CS | GPIO4 | free choice |
| DC | GPIO5 | free choice |
| BUSY | GPIO6 | free choice |
| RST | GPIO7 | free choice |

Plus the battery divider: battery **+** → 100 kΩ → **GPIO2** → 100 kΩ → GND.

### "What about the Pico version of this panel?"

Waveshare also sells a **Pico-ePaper-4.2** — the same 400×300 B/W panel, but with
a female header a Raspberry Pi Pico plugs straight into ("no soldering
required"). It's tempting, and the *panel* is exactly the one we want. **Buy it
if the price is right, but pair it with the XIAO ESP32-C3, not a Pico** — it
also exposes the standard 8-pin interface (VCC/GND/DIN/SCK/CS/DC/RST/BUSY) for
other controller boards, which maps onto the wiring table above. You just leave
the Pico header unused.

Why not actually use a Pico with it:

| Problem | Detail |
|---|---|
| **A plain Pico has no WiFi** | The device's whole job is to download a PNG from the server. A non-W Pico can't. You'd need a Pico W / Pico 2 W. |
| **No working deep sleep on RP2040** | ESPHome's `deep_sleep` [does not work on RP2040](https://github.com/esphome/issues/issues/4124) — the board draws as much asleep as awake. That removes the battery/cable-free premise entirely; it would need mains power. |
| **Firmware rewrite** | `firmware/eatme-display.yaml` targets the ESP32-C3. The RP2040 is a different ESPHome platform. |

For the record, `online_image` *was* [enabled for RP2040](https://github.com/esphome/esphome/pull/7769), so fetching and drawing would work — it's specifically the sleep/battery side that fails. If you ever wanted a permanently mains-powered screen, a Pico W becomes viable; for the battery build it isn't.

### Optional: solar "never recharge" add-on

| Item | Cost | Notes |
|---|---|---|
| **5–6 V solar panel, ~1–2 W** | ~£8–15 | For **average room light** — indoor light is ~200× dimmer than daylight, so solar *extends* battery life substantially rather than fully sustaining it. Near a window it does much better. |

Use a **standard LiPo**, not LiFePO4 — LiFePO4 needs a LiFePO4-aware charger,
which fights the XIAO's built-in USB-C charging.

### Optional: mounting

A picture frame, a 3D-printed stand, or magnets for the fridge. No specific part
recommended — depends where it's going.

### Zero-soldering alternatives

If you'd rather not solder, these run the same server-rendered dashboard —
only `firmware/*.yaml` and two resolution constants change:

| Device | Cost | Trade-off |
|---|---|---|
| **Seeed reTerminal E1001** | ~$79 | Finished 7.5″ device, case, battery, buttons, documented ESPHome pins. Nothing to wire. But ~0.9 mA sleep → ~3 months per charge regardless. |
| **Seeed XIAO 7.5″ ePaper Panel** | ~$50 | Same idea, cheaper, fewer frills. |
| **Inkplate 6** | ~$150 | The low-power champion (~18–25 µA sleep) — best choice if you want solar-forever with no fuss. |

## 4. NFC tags (stretch — not implemented)

| Item | Cost | Notes |
|---|---|---|
| NTAG213 stickers | ~£5–8 for 10–20 | Tap the phone on the lid instead of scanning a QR. iPhones read NFC natively; the tag stores the same `/i/<qrUid>` URL. |

**Not built yet** — this is on the P9 stretch list. The tags would work with the
existing deep links, but nothing in the app writes them today. Don't order these
expecting a feature.

---

## Suggested order of purchase

1. **Nothing, for now.** Get the add-on running on the Pi and the app on your
   phone first — that's the whole product.
2. **Adhesive A4 paper** when you start decanting things into jars and want
   labels (P5 is shipped and works).
3. **The display kit** when you want the kitchen screen. It's a weekend build
   with a soldering iron.
4. **NFC tags** — only once the feature actually exists.

---

Related: [03 · Hardware](03-hardware.md) (the reasoning behind these choices) ·
[P6 · E-ink display](plan/06-phase-eink-display.md) (firmware detail) ·
[addon/DOCS.md](../addon/DOCS.md) (installing on the Pi)
