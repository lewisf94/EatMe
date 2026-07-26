# EatMe — Home Assistant app

Runs the EatMe server on your Home Assistant Pi. The inventory database lives
in `/data`, so it's included in Home Assistant backups. Optionally brings up a
real HTTPS URL (via bundled Tailscale) so you can install the phone app and use
the camera scanner on iOS.

## Install from the app repository (recommended)

`config.yaml`, `Dockerfile` and `repository.yaml` live at the **repo root** on
purpose: the Supervisor uses the directory containing `config.yaml` as the
Docker build context, and the Dockerfile needs the whole monorepo (`apps/`,
`packages/`, `pnpm-*`) to build the web app. This repo is set up as a
single-app repository — `config.yaml` at the root defines the app.

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
| `auth_token` | Optional. If set, the API requires this token; paste the same value into the app's **Settings > Access token** on each device. Leave blank on a trusted home network. |
| `receipt_provider` | `stub` (canned OCR, works out of the box) or `local` (the [eatme-ocr sidecar](ocr/README.md) on the Pi for real receipt scanning). |
| `ocr_url` | Base URL of the OCR sidecar when `receipt_provider` is `local` (e.g. `http://homeassistant.local:8765`). |

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

- EatMe runs with Home Assistant protection enabled and requests no privileged
  capabilities, host networking, Supervisor access or Docker access.
- An enforced AppArmor profile limits executable files, writable paths and
  Linux capabilities. Home Assistant applies the profile when the app is
  installed.
- Tailscale limits the HTTPS URL to signed-in devices on your tailnet. For
  another layer of protection, set a long random `auth_token` and paste the same
  value into **EatMe > Settings > Access token** on every device.
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
  `8099`, so it needs no Tailscale. Set `DISPLAY_TOKEN` (an env var, not an
  app option today; see `apps/server/src/config.ts`) if you want the
  display endpoint gated even with `auth_token` off.
- This app **bundles its own Tailscale** because the official Home Assistant
  Tailscale app serves Home Assistant itself, not other apps.
