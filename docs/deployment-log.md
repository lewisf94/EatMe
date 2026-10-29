# Deployment log

What is installed where, and what changed. Newest entry first.

Do not record Wi-Fi names, passwords, tokens or IP addresses here. Those stay
in Home Assistant, the router and the MagTag's own `settings.toml`.

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
  move. Found in CircuitPython 10.2.1 safe mode. Investigation in progress.
- Still to do: charge and check the battery, update `settings.toml` for the
  new Wi-Fi and server address, copy firmware 0.4 (`code.py`), and work
  through the verification checklist in `firmware/magtag/README.md`.

**Still to do**

- Check that the phone app loads on the new network.
- Scan one printed QR label to check that it still opens EatMe.
- CAD: add the part files (Pack and Go) and a STEP export to `CAD/`.
