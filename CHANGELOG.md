# Changelog

Notable Home Assistant app changes are recorded here.

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
