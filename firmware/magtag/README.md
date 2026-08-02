# EatMe MagTag firmware

CircuitPython 10+ firmware for the [Adafruit MagTag](https://www.adafruit.com/product/4800).
It wakes, connects to Wi-Fi, downloads one 296 × 128 four-gray BMP, refreshes
the panel only when its content changed, reports optional status, and
deep-sleeps. The image stays in RAM and its short content validator plus
selected page stay in sleep memory, so normal refreshes do not write to
CIRCUITPY flash.

**Written but not yet run on this project's real hardware.** Work through the
[verification checklist](#verification-checklist) before relying on it
unattended on battery power.

## Files

| File | Purpose |
|---|---|
| `code.py` | Complete wake, fetch, display, status and sleep cycle. |
| `settings.toml.example` | Copy to `settings.toml` on the device and fill in Wi-Fi and server details. |
| `requirements.txt` | CircuitPython Bundle libraries required by `code.py`. |

## Setup

1. Install the latest CircuitPython for MagTag. The 2025 SSD1680 revision
   requires CircuitPython 10 or later and an updated TinyUF2 bootloader; using
   10+ for either revision keeps one supported setup.
2. From the CircuitPython Community Bundle matching that major version, copy
   these libraries into `CIRCUITPY/lib/`:
   - `adafruit_connection_manager.mpy`
   - `adafruit_imageload/`
   - `adafruit_requests.mpy`
3. Copy `code.py` to the root of `CIRCUITPY`. If upgrading from the earlier
   EatMe draft, delete its obsolete `boot.py` and `/dashboard.bmp`; the new
   client does not remount or write the device filesystem.
4. Copy `settings.toml.example` to `CIRCUITPY/settings.toml`, then enter the
   Wi-Fi credentials, the EatMe server's numeric LAN address and `EATME_TOKEN`
   if the Home Assistant app has `magtag_token` configured.
5. Reset the board and watch the serial console. Confirm it receives HTTP 200,
   refreshes once and schedules deep sleep. On the next unchanged timer wake it
   should receive HTTP 304, keep the existing image and return to sleep without
   refreshing the panel.

Before the board arrives, run the server preflight from the repository root. It
checks all three display pages and their BMP headers without changing food data:

```powershell
$env:EATME_MAGTAG_TOKEN="replace-with-the-device-token"
pnpm magtag:preflight http://homeassistant.local:8099 --full
```

Full mode also checks rejected tokens, battery/status telemetry, and valid or
invalid button events. It only updates the MagTag diagnostic settings
(`display_battery`, `magtag_status`, and `magtag_last_button`). Omit `--full`
for a read-only image check.

If `circup` is installed, the libraries can instead be added while the board is
mounted with:

```sh
circup install adafruit_connection_manager adafruit_imageload adafruit_requests
```

## Buttons and battery life

With `EATME_BUTTON_WAKE = true`, buttons A–D wake the board for urgent food,
recipe, shopping and manual refresh pages. CircuitPython's published ESP32-S2
figures put time-alarm deep sleep around 230 µA and pin-alarm sleep around
1.65 mA. Set `EATME_BUTTON_WAKE = false` if scheduled updates matter more than
the button interface. Measure the actual complete board rather than treating
either figure as a battery-life guarantee.

Deep sleep is simulated while connected to a computer over USB. Measure current
with the USB data connection removed and the board powered from its battery.

## Verification checklist

- [ ] Buttons A–D open urgent / recipe / shopping / refresh respectively when
      button wake is enabled.
- [ ] `board.BATTERY` reports a plausible LiPo voltage and percentage on the
      delivered board revision.
- [ ] The screen is landscape, uses all 296 × 128 pixels and shows four-gray
      anti-aliased text without mirroring or inversion.
- [ ] A Wi-Fi or server outage leaves the last e-ink image visible and retries
      after `EATME_FAILURE_SLEEP_MINUTES` rather than staying awake.
- [ ] An unchanged scheduled wake reports `displayUpdated: false`, skips the
      display refresh and still records fresh battery/Wi-Fi health telemetry.
- [ ] `POST /api/magtag/status` records battery, wake reason, firmware and RSSI;
      `POST /api/magtag/button` records a button action without changing food.
- [ ] At least 50 wake, download, refresh and sleep cycles complete reliably.
- [ ] Sleep current is measured with button wake both enabled and disabled
      before choosing the final interval and battery-life expectation.

## Why BMP

The server quantizes each MagTag page to a compact 4-bit indexed BMP (~19 KB).
`adafruit_imageload` decodes the HTTP response directly from `BytesIO`, so the
client gets the panel's four gray levels without a temporary image file or
filesystem remount. The classic ESPHome display continues using PNG at
`/api/display.png`.

The server returns a strong `ETag` for each rendered page. The firmware retains
the most recent validator in `alarm.sleep_memory` and sends `If-None-Match` on
the next scheduled check. A `304 Not Modified` avoids the image transfer and the
far more expensive e-paper refresh. Button D deliberately bypasses the
validator, so a requested manual refresh still redraws the current page.

MagTag endpoints are documented in
[`docs/07-magtag-plan.md`](../../docs/07-magtag-plan.md). The CircuitPython
installation and sleep behavior are based on Adafruit's
[MagTag guide](https://learn.adafruit.com/adafruit-magtag/circuitpython) and
[deep-sleep guide](https://learn.adafruit.com/deep-sleep-with-circuitpython).
