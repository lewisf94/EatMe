# Deployment log

What is installed where, and what changed. Newest entry first.

Do not record Wi-Fi names, passwords, tokens or IP addresses here. Those stay
in Home Assistant, the router and the MagTag's own `settings.toml`.

## 2026-10-30

**Home Assistant**

- The Wi-Fi connection (`wlan0`) kept dropping, so Home Assistant is back on
  a network cable. It kept the same IP address, so `EATME_SERVER` on the
  MagTag does not change. The cable uses a different MAC address from Wi-Fi,
  so set "Always use this IP address" for the wired entry on the BT Smart Hub
  too, or the address can change after a router restart.
- The phone app updated itself to the new EatMe version.
- The three generated tokens are stored in the password manager. The MagTag
  has the `magtag_token` value in `EATME_TOKEN`.

**MagTag**

- Firmware 0.5 installed by copying `code.py` onto CIRCUITPY. The button
  light and the loading screen work, and the light is above the pressed
  button (pixel 0 is on the right, above D).
- EatMe 0.11.3 removed the small dots under round letters (checked on the
  panel). EatMe 0.11.4 makes the text bigger, with a black bar at the top and
  bottom. Firmware 0.6 makes a second press of A show the next urgent items;
  install it by copying the new `code.py` onto CIRCUITPY.
- The screen stopped changing. The cause was the Wi-Fi network: the MagTag
  used the extender network (the name that ends in `_EXT`). It now uses the
  main router network and is placed nearer the router, and the screen
  updates again.
- The dropped Wi-Fi may explain some MagTag `ETIMEDOUT` failures. Buttons
  B and D always failed while A and C always worked, so test all four
  buttons again on the wired connection before looking for another cause.
- From EatMe 0.10.5, tokens are required by default. Copy the generated
  `magtag_token` from the app log into `EATME_TOKEN` on the MagTag.

## 2026-10-29

**Home Assistant**

- EatMe app updated to 0.10.3 (security fix for percent-encoded API paths,
  dependency updates, CSV formula protection, MagTag token header).
- EatMe OCR app updated to 0.1.5 (Python 3.15, Pillow 12.3.0).
- Moved house. Home Assistant now connects to the new router by Wi-Fi
  (`wlan0`), not by cable.
- The router (BT Smart Hub) has "Always use this IP address" set for the
  Home Assistant Wi-Fi entry. Checked after a power cycle: the address and
  MAC address stayed the same.

**MagTag**

- Left switched on with the battery connected for some months before the
  move. Found in CircuitPython 10.2.1 safe mode ("Power dipped"): the
  battery had run flat. Charged through USB-C and reset out of safe mode.
- Copied firmware 0.4 (`code.py`) and updated `settings.toml` for the new
  Wi-Fi and server address.
- First wake failed with "No network with that ssid". A Wi-Fi scan from the
  REPL found the cause, and the fixed `settings.toml` then worked.
- **First successful end-to-end wake cycle on real hardware:** connected to
  Wi-Fi, downloaded the page and drew the EatMe screen (powered over USB).
- Still to do: the rest of the verification checklist in
  `firmware/magtag/README.md` (each button, an unchanged 304 wake, the
  battery reading, at least 50 cycles, sleep current on battery).

**Still to do**

- Check that the phone app loads on the new network.
- Scan one printed QR label to check that it still opens EatMe.
- CAD: add the part files (Pack and Go) and a STEP export to `CAD/`.
