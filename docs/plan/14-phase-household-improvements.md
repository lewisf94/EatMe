# IX: Household improvements

**Status:** implemented and verified in EatMe 0.9.0.

## Goal

Improve everyday safety, usefulness and startup performance without adding a
cloud dependency or turning EatMe into a multi-user platform.

## Design

- Preserve every archive event and add a separate restore event so undo never
  rewrites history.
- Derive insights from stock-lot archive reasons and show money only when a
  matched receipt provides a real product price.
- Record a recipe cooking event without changing quantity; only the user knows
  how much remains.
- Export a versioned allow-listed set of tables. Validate table/column/value
  shape, row limits and foreign keys before a restore transaction commits.
- Publish two small Home Assistant states through the app's Core API access.
  Shopping integration is opt-in and one-way, with local writes winning during
  an HA outage.
- Treat MagTag telemetry as health data visible only through the household API,
  never through the device-token exemption.
- Split React routes so barcode/OCR code is not part of the initial screen's
  JavaScript chunk.

## Acceptance checklist

- [x] An archived pack can be restored and both events remain visible.
- [x] Insights cover finished, binned and cooked activity over selectable dates.
- [x] Recipe missing ingredients are deduplicated on Shopping.
- [x] MagTag health reports missing, stale and low-battery states.
- [x] A valid backup round-trips; malformed data leaves the database unchanged.
- [x] SQLite quick-check and foreign-key integrity are exposed in Settings.
- [x] Home Assistant sensor failures never reject EatMe writes.
- [x] Initial JavaScript is materially smaller after route splitting.
- [x] Server, production build and browser suites pass.
