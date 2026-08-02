# EatMe MagTag firmware

CircuitPython 10+ firmware for the [Adafruit MagTag](https://www.adafruit.com/product/4800),
implementing the wake cycle in [`docs/07-magtag-plan.md`](../../docs/07-magtag-plan.md):
wake, connect Wi-Fi, download one rendered image, refresh the panel, report
optional status, deep sleep.

**Written but not yet run on real hardware.** It follows the documented
MagTag pinout and CircuitPython 10 APIs, but this repository has no MagTag to
test against. Work through [Verification checklist](#verification-checklist)
before trusting it on battery power unattended.

## Files

| File | Purpose |
|---|---|
| `code.py` | The wake cycle itself. |
| `boot.py` | Makes the filesystem writable from code (needed to save the fetched image), unless button A is held at boot. |
| `settings.toml.example` | Copy to `settings.toml` on the device and fill in Wi-Fi + server details. Never commit the real file. |

## Setup

1. Install **CircuitPython 10** (or later) on the MagTag via the
   [Adafruit installer](https://circuitpython.org/board/adafruit_magtag_2.9_grayscale/).
2. Copy these CircuitPython Community Bundle libraries to `/lib` on the
   `CIRCUITPY` drive (match the bundle version to your CircuitPython version):
   - `adafruit_requests.mpy`
   - `adafruit_connection_manager.mpy`
3. Copy `code.py`, `boot.py` to the root of `CIRCUITPY`.
4. Copy `settings.toml.example` to `settings.toml` on `CIRCUITPY` and fill in
   your Wi-Fi credentials, the server URL, and `EATME_TOKEN` if the server has
   `MAGTAG_TOKEN` set (see `apps/server/src/config.ts` and
   [`addon/DOCS.md`](../../addon/DOCS.md)).
5. Reset the board. It should connect, fetch the dashboard, draw it and sleep.

If you need to get back into the `CIRCUITPY` drive from a computer afterwards,
hold button **A** while resetting — `boot.py` leaves the filesystem
USB-writable in that case, at the cost of the device not being able to save
its own fetched image until you let go and reset again.

## Verification checklist

Confirm each of these against the actual board and update the code if they
differ — none of them were checked against real hardware:

- [ ] `board.BUTTON_A` / `_B` / `_C` / `_D` are the correct four buttons, in
      the order urgent / recipe / shopping / refresh (swap `BUTTON_ACTIONS` in
      `code.py` if not).
- [ ] Those four pins wake the board from deep sleep as `alarm.pin.PinAlarm`
      sources — the Adafruit MagTag deep-sleep guide documents this pattern,
      but confirm on your unit.
- [ ] `board.VOLTAGE_MONITOR` is the correct battery-sense pin name for your
      MagTag revision. If `read_battery_percent()` logs "No battery monitor
      available", check Adafruit's MagTag pinout reference and correct the
      pin name — the wake cycle still completes fine without it, just without
      a reported battery percentage.
- [ ] `board.DISPLAY` auto-initializes to the correct panel driver (expected
      for a stock MagTag; only relevant if you've swapped the display).
- [ ] One full wake-fetch-draw-sleep cycle actually shows the dashboard
      correctly, matches the 296×128 four-gray image the server renders, and
      the device returns to deep sleep rather than hanging.
- [ ] `POST /api/magtag/status` and `POST /api/magtag/button` calls reach the
      server and update its settings (`magtag_status` / `magtag_last_button`)
      — check via the server logs or by inspecting the SQLite `settings`
      table.
- [ ] Measure actual wake duration and battery drain over at least a few
      dozen cycles before trusting `EATME_SLEEP_HOURS` for unattended
      operation, per the validation discipline in
      [`docs/07-magtag-plan.md`](../../docs/07-magtag-plan.md).

## Why BMP, not PNG

The server's classic ESPHome-facing endpoint (`/api/display.png`) serves PNG
because ESPHome's `online_image` component decodes PNG natively. CircuitPython
has no equivalent built-in PNG decoder for e-paper use, but
`displayio.OnDiskBitmap` streams a BMP straight to the panel without decoding
a whole image into RAM first — the well-documented pattern for MagTag-style
info displays. So the MagTag-specific endpoints
(`/api/magtag/display.bmp`, `/api/magtag/page/:page`) serve a compact 4-bit
indexed grayscale BMP instead (`apps/server/src/services/magtagDisplay.ts`).
