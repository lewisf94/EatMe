# Deployment log

What is installed where, and what changed. Newest entry first.

Do not record Wi-Fi names, passwords, tokens or IP addresses here. Those stay
in Home Assistant, the router and the MagTag's own `settings.toml`.

## 2026-10-30

**Home Assistant**

- The Wi-Fi connection (`wlan0`) kept dropping, so Home Assistant is back on
  a network cable. The cable uses a different MAC address from Wi-Fi, so the
  router can give it a different IP address. Still to do: set "Always use
  this IP address" for the wired entry on the BT Smart Hub, and update
  `EATME_SERVER` on the MagTag if the address changed.
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
