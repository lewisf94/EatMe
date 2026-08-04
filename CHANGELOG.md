# Changelog

Notable Home Assistant app changes are recorded here.

## 0.10.1

- Fit MagTag product names using the bundled font's pixel widths instead of a
  fixed character limit, so narrow names use the full 296-pixel display.
- Increase small MagTag text size and contrast, add clearer row and footer
  structure, and show the total number of urgent items alongside battery state.
- Wrap recipe and shopping details over the previously unused screen space,
  including a count of shopping items beyond the four-item preview.

## 0.10.0

- Let MagTag firmware retain a content validator in deep-sleep memory and skip
  both the BMP transfer and e-paper refresh when dashboard content is unchanged.
- Cache unchanged MagTag renders server-side, report whether the screen was
  updated and record wake duration in device health.
- Create one atomic local recovery snapshot per day, retain a configurable 1â€“30
  snapshots and provide an on-demand snapshot action in Settings.
- Add same-origin enforcement for browser writes plus Content Security Policy,
  permissions, framing and HTTPS transport headers.
- Extend the reusable MagTag preflight and automated tests to cover conditional
  refreshes, rotating snapshots and cross-site write rejection.

## 0.9.0

- Add a recent-activity screen with one-tap restore for accidentally removed
  packs, plus 30/90/365-day finished, binned and cooking insights.
- Estimate used and wasted value only when matched receipt prices are available;
  never invent a price for unpriced food.
- Add recipe actions to put missing ingredients on Shopping and record which
  expiring ingredients were used without guessing a remaining quantity.
- Add MagTag last-seen, battery, Wi-Fi, firmware and configurable stale/low
  battery health reporting to Settings.
- Add versioned full JSON backup/restore, inventory CSV export and transactional
  SQLite integrity/foreign-key checks.
- Publish expiring-soon and low-stock sensor states through Home Assistant's app
  API, with optional one-way mirroring to its built-in shopping list.
- Lazy-load phone screens and scanner code, reducing initial JavaScript from
  about 412 KB to 228 KB while retaining offline precaching.

## 0.8.5

- Upgrade the web and server runtimes to patched React Router, Fastify and
  static-file dependencies, and audit production packages in CI.
- Make shopping, receipt, recipe and idempotency writes atomic, add a SQLite
  lock timeout, verify the database in health checks and shut down cleanly.
- Bound request bodies and external lookups, validate device telemetry and
  settings, compare credentials safely and avoid exposing internal errors.
- Coalesce simultaneous barcode lookups, restrict Web Push targets to the
  current origin and add explicit browser security headers.
- Bound OCR memory, request and processing time, serialize expensive OCR work,
  and harden MagTag configuration, downloads and token handling.
- Add weekly dependency monitoring and reject unapproved package install
  scripts.

## 0.8.4

- Add the Adafruit MagTag's 296 × 128 four-gray dashboards and CircuitPython
  client, with urgent-food, recipe and shopping pages.
- Decode downloaded BMPs in RAM so routine MagTag refreshes do not write flash,
  and support scheduled-only sleep when lower power matters more than buttons.
- Add `magtag_token` and `display_token` Home Assistant app options for
  device-scoped e-ink API credentials.

## 0.8.3

- Select OCR passes by complete product-and-price rows rather than isolated
  price fragments.
- Include the selected page layout, threshold method and safe row counts in the
  main EatMe log for precise receipt diagnostics without logging receipt text.

## 0.8.2

- Keep adjacent receipt rows separate when glare or punctuation produces a tall
  OCR bounding box.
- Remove isolated VAT markers that OCR reads as an `X` or asterisk at the end
  of a product name.
- Add a sparse-text recognition pass to recover faint product rows missed by
  the column- and block-oriented passes.

## 0.8.1

- Send a higher-detail receipt image from the browser to preserve small print.
- Offer separate camera and existing-image controls on the receipt screen.
- Reconstruct product names and right-aligned prices that OCR separates into
  different layout blocks.
- Crop dark worktops automatically, compare receipt-friendly page layouts and
  test both standard and Sauvola thresholding before retaining the strongest
  result.
- Accept comma and OCR-spaced prices, and discard reduced-price messages.
- Log privacy-safe recognition counts and mean confidence without logging
  receipt contents.

## 0.8.0

- Package EatMe OCR as a second installable Home Assistant app for genuine
  private receipt recognition instead of fixed demonstration results.
- Use Tesseract with its local English model for reliable AMD64 and ARM64
  installation without downloading models at runtime.
- Discover the sibling OCR app automatically when `ocr_url` is left blank.
- Make local OCR the default for new EatMe installations and clearly log when
  the fixed development stub is selected.
- Return actionable receipt errors when the OCR app is stopped, unreachable,
  times out or cannot find readable text.

## 0.7.6

- Correct the browser tests to recognise the intentional Automatic category
  default, rather than requiring a user-selected category.
- Keep the image gate architecture-specific and comprehensive while validating
  the AppArmor profile can load separately. The Linux CI runner's synthetic
  profile confinement exits before the entrypoint and does not reflect the
  Home Assistant runtime, which is already verified by the add-on health check.

## 0.7.5

- Start the app script through Alpine's POSIX shell so the same entrypoint is
  valid when an AppArmor profile is enforced by Home Assistant or CI.
- Run each CI container with its explicit target platform and print the stopped
  container state and logs before a startup-check failure.

## 0.7.4

- Allow the ARM64 and AMD64 native display renderer to be memory-mapped by the
  enforced AppArmor profile.
- Pin the Node.js and Tailscale container inputs so rebuilding a published
  version cannot silently select different base software.
- Store Tailscale's cache in the persistent writable data directory instead of
  attempting to write under `/root`.
- Build and start both supported architectures in CI, under the enforced
  AppArmor profile, and exercise health, food guidance, display rendering and
  web serving before the check passes.
- Update the installation and troubleshooting guide for the current Home
  Assistant Apps interface and the pinned Tailscale setup.
