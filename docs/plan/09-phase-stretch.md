# P9: Optional future work

**Goal:** keep possible extensions recorded without committing to their implementation. Each idea needs a short, separate plan and approval before work starts.

**Prerequisites:** the relevant earlier phases, noted for each idea.

## Ideas

### P9a: Home Assistant sensors and shopping-list integration (needs P4, P7)

**Status: built in 0.9.0.** EatMe publishes expiring-soon and low-stock states
through the Home Assistant Core app API. An opt-in, one-way mirror sends EatMe
shopping changes to Home Assistant's built-in shopping list; EatMe remains the
source of truth so an HA outage never rejects a cupboard write.

Expose `sensor.eatme_expiring_soon` and `sensor.eatme_low_stock` for Home Assistant automations and dashboards. Consider syncing the shopping list to a Home Assistant todo entity. Confirm the current MQTT discovery schema and whether MQTT or the Home Assistant API is the appropriate interface before implementation.

### P9b: NFC lids as a QR alternative (needs P5)

Use NTAG213 stickers storing the same `/i/:qrUid` URL. iPhones read these natively. Decide whether this only needs documentation and label-writing instructions or needs app support.

### P9c: Waste and usage statistics (needs P1)

**Status: built in 0.9.0.** The History & insights screen reports finished,
binned and cooked activity over selectable periods. Value estimates are shown
only for products with matched receipt prices.

Use `usage_log` to add a statistics screen for items discarded, items rarely finished and category throughput. This is read-only and should not require a schema change.

### P9d: Multiple displays (needs P6)

Extend `GET /api/display.png` with panel presets for resolution, layout and content so multiple display devices can be supported.

### P9e: Low-power Thread cupboard sensors (needs P9a)

Consider a cupboard temperature and humidity sensor, door sensor or acknowledgement button. Select the hardware and decide whether its measurements should influence freshness guidance before implementation.

## Protocol

For any selected item, create a `docs/plan/09x-<name>.md` file with the goal, sources, design, acceptance checklist and manual verification steps. Get approval before implementation and keep the change focused.
