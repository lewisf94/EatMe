# EatMe — Home Assistant app

Runs the EatMe server on your Home Assistant Pi. The inventory database lives
in `/data`, so it's included in Home Assistant backups. Optionally brings up a
real HTTPS URL (via bundled Tailscale) so you can install the phone app and use
the camera scanner on iOS.

## Install from the app repository (recommended)

`config.yaml`, `Dockerfile` and `repository.yaml` live at the **repo root** on
purpose: the Supervisor uses the directory containing `config.yaml` as the
Docker build context, and the Dockerfile needs the whole monorepo (`apps/`,
`packages/`, `pnpm-*`) to build the web app. The repository also contains the
separate **EatMe OCR** app under `addon/ocr`.

1. In Home Assistant, open **Settings > Apps > App store**.
2. Open the three-dots menu, select **Repositories**, add
   `https://github.com/lewisf94/EatMe`, then select **Add**.
3. Refresh the browser if EatMe does not appear. If necessary, use the
   three-dots menu and select **Check for updates**.
4. Select **Install**. The first build takes a few minutes because it clones the repo,
   installs deps and builds the web app in-container. Watch progress in the
   app's **Log** tab.
5. **Start**. Open the **Web UI** (or `http://homeassistant.local:8099`) to
   confirm it's up on the LAN.
6. For future updates, return to **Settings > Apps > App store**, select
   **Check for updates**, then select **Update** on the EatMe card. The update
   can take a minute to appear after a new version is published.

## Enable real receipt scanning

The `stub` receipt provider returns fixed demonstration products for automated
tests. It does not inspect the photograph.

1. In **Settings > Apps > App store**, open the same EatMe repository and
   install **EatMe OCR**.
2. Enable **Start on boot** and **Watchdog**, then start EatMe OCR. Its current
   log should end with `[eatme-ocr] listening on :8765`.
3. Open the main EatMe app's **Configuration** tab.
4. Set `receipt_provider` to `local` and leave `ocr_url` blank.
5. Save and restart EatMe. Its log will print the automatically discovered
   internal OCR address.

Both apps run locally on the Home Assistant machine. Photographs are handled
in memory and discarded after recognition; only parsed receipt lines are
stored in EatMe. Clear, evenly lit photographs with the receipt filling the
frame produce the best results, and the review screen remains the final check
before stock is added.

> LAN-only (`http://...:8099`) works for browsing, but **the camera scanner and
> Web Push need HTTPS**. See below.

## Install as a local app (fallback)

1. Install the **Samba share** or **Advanced SSH & Web Terminal** app.
2. Copy the **entire repo** to `/addons/eatme` on the Pi (the Dockerfile needs
   `apps/`, `packages/`, `pnpm-*` etc. because the build context is the repo root,
   and `config.yaml`/`Dockerfile` are already at that root).
3. Open **Settings > Apps > App store**, select **Check for updates**, then
   install EatMe from **Local apps**.
4. **Start**. Open `http://homeassistant.local:8099` to confirm it's up.

## Options

| Option | What it does |
|---|---|
| `tailscale_authkey` | Paste a Tailscale **auth key** for the first connection. Once the app has joined successfully, clear this field; EatMe reuses its saved Tailscale identity. |
| `tailscale_hostname` | The device name on your tailnet (default `eatme`). |
| `auth_token` | The access token for the web app and API. Leave blank to let EatMe generate one on first start: the app log shows it once, on a line that starts `[eatme] generated auth_token:`. Each phone or browser asks for it once. Set your own long random value to replace it. |
| `display_token` | The device token for the fallback ESPHome display. Generated like `auth_token` when blank (`generated display_token:` in the log). |
| `magtag_token` | The device token for `/api/magtag/*`. Generated like `auth_token` when blank (`generated magtag_token:` in the log). Put the same value in `EATME_TOKEN` on the MagTag; never use the household admin token there. |
| `open_access` | Off by default. Turn it on only to run without tokens, as versions before 0.10.5 did; then any device on your network can read and change EatMe. Backups and restore still need `auth_token`. |
| `allowed_hosts` | Leave blank unless you open EatMe through a public domain name, such as a reverse proxy at `eatme.example.com`. LAN addresses and `.local`, `.lan`, `.home.arpa` and `.ts.net` names always work. List extra names separated by commas; a leading dot (`.example.com`) allows every subdomain. Other names receive HTTP 421, which blocks DNS-rebinding attacks from malicious web pages. |
| `receipt_provider` | `local` for the separate **EatMe OCR** app. `stub` returns fixed demonstration data and is only useful for development. |
| `ocr_url` | Leave blank to discover EatMe OCR automatically. Set an explicit base URL only when the OCR service is hosted elsewhere. |

## Automatic food guidance

When category, storage location or date are left on **Automatic**, EatMe uses
its bundled local guidance table. This applies to manual additions, barcode
scans, receipt imports, extra packs and shopping-list repurchases. The date
added is treated as the purchase date unless a receipt supplied one.

A printed date always overrides the estimate. Inferred dates are labelled as
estimated best-quality reminders and are never treated as manufacturer use-by
dates. Unknown products receive no estimated date. The methodology and
authoritative references are documented in
[Food guidance and sources](../docs/food-guidance.md).

Dietary requirements can be selected in **EatMe > Settings**. They filter
use-it-up suggestions and the repeat-safe starter-recipe import. Ingredient
labels must still be checked for allergies and cross-contamination.

## History, backups and Home Assistant

EatMe **Settings** now includes:

- **History & insights** for recent changes, undoing an accidental removal and
  reviewing finished/binned patterns.
- **MagTag health** for last check-in, battery, Wi-Fi signal, firmware, wake
  duration and whether the last wake actually refreshed the screen.
- **Data & backups** for a versioned full JSON export/restore, inventory CSV and
  an on-demand database integrity check. **These require `auth_token` to be
  set.** Exporting reveals the whole database and restoring replaces it, so
  unlike the rest of the API they refuse to run rather than staying open to
  anything on the LAN; without a token they return "set auth_token in the EatMe
  app configuration to use backups and restore". EatMe still writes one atomic
  recovery snapshot per day under `/data/backups` regardless; Settings can
  retain 1–30 copies and create one immediately or download the latest. Export a
  current backup before using restore; restore replaces EatMe's food, recipes,
  shopping list and history. Local snapshots are included in Home Assistant
  backups but do not replace an occasional export to another device.
- **Home Assistant** status. EatMe publishes `sensor.eatme_expiring_soon` and
  `sensor.eatme_low_stock` every 15 minutes. Optional shopping mirroring sends
  new EatMe list actions one-way to Home Assistant's built-in shopping list.

## Enabling HTTPS (for the phone app, camera, and Web Push)

1. In the **Tailscale admin console**: enable **MagicDNS** and **HTTPS
   Certificates** under **Settings > Features**. Generate an **auth key** under
   **Settings > Keys > Generate auth key**. A reusable key is convenient.
2. Paste the key into the app's `tailscale_authkey` option, set a
   `tailscale_hostname`, **Save**, and **Restart** the app. Check the app
   **Log**; it prints the URL once Tailscale is up.
3. Once the HTTPS URL works, clear `tailscale_authkey`, **Save**, and **Restart**.
   The joined device identity is stored in `/data` and does not need the
   enrolment key again.
4. On your iPhone: install the **Tailscale** app and sign in to the same tailnet.
   Open `https://<hostname>.<your-tailnet>.ts.net` in Safari, then use **Share > Add to
   Home Screen**. The same URL works at home and away.
5. **This is a hard requirement for Web Push (P8) and the camera scanner**: iOS
   only delivers push to an installed PWA served over HTTPS, and only allows
   camera access over a secure context. LAN-only HTTP won't do either.

## Security

- EatMe runs with Home Assistant protection enabled and requests only the Home
  Assistant Core API used for its two sensors and optional shopping mirror. It
  requests no privileged capabilities, host networking, Supervisor management
  API or Docker access.
- An enforced AppArmor profile limits executable files, writable paths and
  Linux capabilities. Home Assistant applies the profile when the app is
  installed.
- Tailscale limits the HTTPS URL to signed-in devices on your tailnet. The
  access token adds a second layer and also protects the LAN port.
- EatMe generates `auth_token`, `display_token` and `magtag_token` on first
  start unless you set them, and keeps them in `/data/secrets` (included in
  Home Assistant backups). The log shows each value only on the start that
  creates it. If you lose one, set the option to a new long random value.
- Requests must name a LAN address, a private name or an `allowed_hosts` entry,
  so a malicious web page cannot reach EatMe through DNS rebinding.
- After 20 wrong tokens in five minutes, a client receives HTTP 429 until the
  window ends. Tokens shorter than 20 characters log a startup error.
- Notification subscriptions are accepted only for browser push services
  (Google, Mozilla, Apple, Microsoft), at most 20 devices.
- Browser writes are accepted only from EatMe's own origin. The app also sends a
  restrictive content policy, disables framing and unnecessary browser APIs,
  and enables transport security on HTTPS requests.
- Do not share a Tailscale auth key or EatMe access token in logs or screenshots.

## Notes & troubleshooting

- **Backups**: the SQLite DB is at `/data/eatme.db` and is included in HA
  backups automatically. So are the generated **VAPID push keys**
  (`/data/vapid.json`). Do not delete that file, or every existing
  notification subscription breaks.
- **HTTPS URL cannot be reached**: confirm the EatMe app is running, both
  devices are online in the same Tailscale network, and MagicDNS and HTTPS
  Certificates are enabled. The current app pins its Tailscale version and
  configures HTTPS to proxy `http://127.0.0.1:8099`; do not edit `run.sh` on
  Home Assistant.
- **The app repeatedly restarts**: copy only the log entries from the most
  recent `[eatme] starting` line onward. Older entries remain visible in the
  Home Assistant log after an update and do not mean the current version is
  still failing.
- **e-ink display (P6)**: it talks to this app over plain LAN HTTP on
  `8099`, so it needs no Tailscale. Add `&token=` with the `display_token`
  value to its image URL.
- **MagTag display**: the Adafruit MagTag talks to `/api/magtag/*` over the
  same plain LAN HTTP port. Put the `magtag_token` value in `EATME_TOKEN` on
  the device. Use a separate, URL-safe
  value from `auth_token` so the MagTag never carries the household's admin
  credential.
- This app **bundles its own Tailscale** because the official Home Assistant
  Tailscale app serves Home Assistant itself, not other apps.
