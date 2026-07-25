# EatMe — Home Assistant add-on

Runs the EatMe server on your Home Assistant Pi. The inventory database lives
in `/data`, so it's included in Home Assistant backups. Optionally brings up a
real HTTPS URL (via bundled Tailscale) so you can install the phone app and use
the camera scanner on iOS.

## Install (add-on repository — recommended)

`config.yaml`, `Dockerfile` and `repository.yaml` live at the **repo root** on
purpose: the Supervisor uses the directory containing `config.yaml` as the
Docker build context, and the Dockerfile needs the whole monorepo (`apps/`,
`packages/`, `pnpm-*`) to build the web app. This repo is set up as a
single-add-on repository — `config.yaml` at the root *is* the add-on.

1. Home Assistant → **Settings → Add-ons → Add-on store → ⋮ → Repositories**.
2. Add `https://github.com/lewisf94/EatMe` → **Add**.
3. Refresh the store (⋮ → **Check for updates** if it doesn't appear). "EatMe"
   shows up as a new add-on (not under "Local add-ons").
4. **Install**. The first build takes a few minutes — it clones the repo,
   installs deps and builds the web app in-container. Watch progress in the
   add-on's **Log** tab.
5. **Start**. Open the **Web UI** (or `http://homeassistant.local:8099`) to
   confirm it's up on the LAN.
6. Future updates: **Settings → Add-ons → Add-on store → ⋮ → Check for
   updates**, then **Update** on the EatMe card — no manual copying.

> LAN-only (`http://…:8099`) works for browsing, but **the camera scanner and
> Web Push need HTTPS** — see below.

## Install (local add-on — fallback if the repository doesn't show up)

1. Install the **Samba share** or **Advanced SSH & Web Terminal** add-on.
2. Copy the **entire repo** to `/addons/eatme` on the Pi (the Dockerfile needs
   `apps/`, `packages/`, `pnpm-*` etc. — the build context is the repo root,
   and `config.yaml`/`Dockerfile` are already at that root).
3. **Settings → Add-ons → Add-on store → ⋮ → Check for updates**. "EatMe"
   appears under **Local add-ons**. Click **Install**.
4. **Start**. Open `http://homeassistant.local:8099` to confirm it's up.

## Options

| Option | What it does |
|---|---|
| `tailscale_authkey` | Paste a Tailscale **auth key** for the first connection. Once the app has joined successfully, clear this field; EatMe reuses its saved Tailscale identity. |
| `tailscale_hostname` | The device name on your tailnet (default `eatme`). |
| `auth_token` | Optional. If set, the API requires this token; paste the same value into the app's **Settings → Access token** on each device. Leave blank on a trusted home network. |
| `receipt_provider` | `stub` (canned OCR, works out of the box) or `local` (the [eatme-ocr sidecar](ocr/README.md) on the Pi — real receipt scanning). |
| `ocr_url` | Base URL of the OCR sidecar when `receipt_provider` is `local` (e.g. `http://homeassistant.local:8765`). |

## Enabling HTTPS (for the phone app, camera, and Web Push)

1. In the **Tailscale admin console**: enable **MagicDNS** and **HTTPS
   Certificates** (Settings → Features). Generate an **auth key** (Settings →
   Keys → Generate auth key; reusable is convenient).
2. Paste the key into the add-on's `tailscale_authkey` option, set a
   `tailscale_hostname`, **Save**, and **Restart** the add-on. Check the add-on
   **Log** — it prints the URL once Tailscale is up.
3. Once the HTTPS URL works, clear `tailscale_authkey`, **Save**, and **Restart**.
   The joined device identity is stored in `/data` and does not need the
   enrolment key again.
4. On your iPhone: install the **Tailscale** app and sign in to the same tailnet.
   Open `https://<hostname>.<your-tailnet>.ts.net` in Safari → **Share → Add to
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
  (`/data/vapid.json`) — don't delete that file, or every existing
  notification subscription breaks.
- **`tailscale serve` failed** in the log: flag names vary by Tailscale version.
  Open a terminal in the add-on container and run `tailscale serve --help`, then
  adjust the command in `run.sh`. (The intent: background-serve HTTPS:443 →
  `http://127.0.0.1:8099`.)
- **e-ink display (P6)**: it talks to this add-on over plain LAN HTTP on
  `8099`, so it needs no Tailscale. Set `DISPLAY_TOKEN` (an env var, not an
  add-on option today — see `apps/server/src/config.ts`) if you want the
  display endpoint gated even with `auth_token` off.
- This add-on **bundles its own Tailscale** on purpose — the official Home
  Assistant Tailscale add-on only serves Home Assistant itself, not other
  add-ons.
