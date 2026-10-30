# Changelog

Notable Home Assistant app changes are recorded here.

## 0.11.5

- On a computer or another wide screen (1024 px or wider), the web app looks
  like a desktop app. A dark side bar holds every screen: Today, Use it up,
  Recipes, All food, Shopping, Scan a receipt, Labels, History and Settings,
  with an "Add item" button at the top.
- Food and recipes show as cards in two or three columns. Forms, Settings and
  lists keep a comfortable reading width. Swipe to mark food used up still
  works with the mouse, and the Undo bar shows at the bottom of the page.
- The phone layout does not change.

## 0.11.4

- MagTag pages use bigger text: food names up to 22 px, at least 15 px for
  every text. A black bar at the top holds the page name, and a black bar at
  the bottom holds the update time.
- The urgent MagTag page shows up to three items with a short "when" on the
  right, for example "Tomorrow" or "Use by passed". A long name gets smaller
  before it is cut short.
- With more than three items due, the bottom bar shows which ones are on the
  panel, for example "1-3 of 7". With MagTag firmware 0.6, a second press of
  A shows the next items, and after the last items it starts again.

## 0.11.3

- MagTag pages no longer show a small dot under round letters such as c, e, o
  and s. The black-and-white conversion turned the faint edge under those
  letters into a black pixel.

## 0.11.2

- A barcode that is not in Open Food Facts now shows "Not in Open Food Facts —
  enter the details manually" instead of "Lookup unavailable (HTTP 404)". The
  Open Food Facts API answers an unknown barcode with HTTP 404.
- The barcode scanner shows a taller guide box and a hint to hold the phone
  close. The scanner reads the whole camera picture, not only the box.
- The printed date field on Add food no longer runs off the right edge of the
  screen on iPhone.

## 0.11.1

- The access-token screen now checks the token with EatMe before it saves it.
  A wrong token shows a message; a correct token shows a "Connected" card.
- Settings uses on/off switches for dietary requirements and the Home
  Assistant shopping mirror.
- Icon-only buttons (Back, Settings, New recipe, Add) show a label on hover or
  keyboard focus, or on a long press on a phone.
- The History period and a pack's date type and location use a new picker.
  The long timezone list keeps the phone's own picker.
- Recipes have an optional 1 to 5 star rating. Backups made before this
  version still restore; their recipes have no rating.
- Uses the SquishSwitch, WarmTooltip, GlideSelect and PeekRating components
  and the card-stack pattern from React Bits.

## 0.11.0

- Swipe a food row left on Today, All food or Use it up. A full swipe marks
  every pack of that item used up; the drawer also offers "Binned". A toast
  offers Undo for 5 seconds; swipe it down to dismiss it.
- Screens fade in when you change page, and buttons respond to a press. Phones
  with "reduce motion" turned on get no animations.
- Uses the SwipeRow and SwipeToast components from React Bits, with the
  `motion` and Hugeicons libraries.

## 0.10.5

- **Security, action needed:** EatMe now requires an access token by default.
  On the first start after this update, a blank `auth_token`, `display_token`
  or `magtag_token` is generated, stored in `/data/secrets`, and printed once
  in the app log (`[eatme] generated auth_token: …`). Copy the values from the
  log. Each phone or browser asks for the access token once. Put the
  `magtag_token` value in `EATME_TOKEN` on the MagTag, and add the
  `display_token` value to the ESPHome display URL. Turn on the new
  `open_access` option only to keep the old unauthenticated LAN behaviour.
- The web app shows an access-token screen when the server answers 401,
  instead of empty pages.

## 0.10.4

- Security: reject requests whose Host is not a LAN address, a private name
  (`.local`, `.lan`, `.home.arpa`, `.ts.net`, single-label) or an entry in the
  new `allowed_hosts` option. This blocks DNS-rebinding attacks, where a
  malicious web page reaches the API through a household browser.
- Security: trust `X-Forwarded-*` headers only from loopback (Tailscale Serve).
  A LAN client can no longer choose the origin printed on QR labels.
- Security: accept push subscriptions only for browser push services, cap them
  at 20 devices, and time out each send after 10 seconds. An API client can no
  longer make the server call internal HTTPS services.
- Security: after 20 wrong tokens in five minutes, a client receives HTTP 429.
  Tokens shorter than 20 characters log a startup error.
- Security: cap the length of names, notes and hints, and accept only
  `http://` and `https://` recipe and image links. The recipe form adds
  `https://` to a link typed without a scheme.
- Security: receipt OCR errors no longer show the private OCR address.
- Security: pass the Tailscale auth key through a private file, not the
  command line.
- CI: run workflows with a read-only repository token.

## 0.10.3

- Security: apply the `auth_token` gate to percent-encoded API paths. Before
  this fix, a request such as `/%61pi/maintenance/backup` reached the API
  handler without the token, including database backup and restore.
- MagTag: quote `EATME_BUTTON_WAKE` in `settings.toml.example`, because
  CircuitPython settings support only strings and integers.
- MagTag firmware 0.4 sends the device token in an `X-EatMe-Device-Token`
  header instead of the URL, so it does not appear in proxy access logs. The
  server still accepts `?token=` from older firmware.
- Inventory CSV export prefixes text that starts with `=`, `+`, `-`, `@`, tab
  or carriage return with an apostrophe, so a spreadsheet does not run a
  product name as a formula.
- Update fastify to 5.12.7, zod to 4.6.7 and @fastify/static to 10.1.8, and
  hold fast-uri and brace-expansion at their patched releases. The production
  dependency audit reports no known vulnerabilities.
- Update development tools (Vite, Vitest, React, Tailwind and others) within
  their current major versions.

## 0.10.2

- Render MagTag text with crisp black/white pixels, larger bold secondary
  lines and fewer tiny labels for reliable reading on the physical panel.

## 0.10.1

- Fit MagTag product names using the bundled font's pixel widths instead of a
  fixed character limit, so narrow names use the full 296-pixel display.
- Increase small MagTag text size and contrast, add clearer row and footer
  structure, and show the total number of urgent items alongside battery state.
- Wrap recipe and shopping details over the previously unused screen space,
  including a count of shopping items beyond the four-item preview.
- Pin patched URI and glob parser dependencies, and extend authenticated
  recovery coverage so release checks exercise the secured maintenance path.

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
