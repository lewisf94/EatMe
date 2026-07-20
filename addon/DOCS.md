# WhatToEat — Home Assistant add-on

Runs the WhatToEat server on your Home Assistant Pi. The inventory database lives
in `/data`, so it's included in Home Assistant backups. Optionally brings up a
real HTTPS URL (via bundled Tailscale) so you can install the phone app and use
the camera scanner on iOS.

## Install (local add-on)

The add-on builds from the repo root, so the whole repo needs to be the build
context. Two ways:

**A. Custom add-on repository (recommended, one-click updates)**

1. Home Assistant → **Settings → Add-ons → Add-on store → ⋮ → Repositories**.
2. Add `https://github.com/lewisf94/WhatToEat`.
3. The store needs the add-on manifest at the repo root. Either move `addon/` to
   the repo root, or keep this layout and use route B. *(If you want route A,
   tell me and I'll add a root-level `whattoeat/` add-on folder + `repository.yaml`.)*

**B. Local add-on (works with this repo layout as-is)**

1. Install the **Samba share** or **Advanced SSH & Web Terminal** add-on.
2. Copy the **entire repo** to `/addons/whattoeat` on the Pi (the Dockerfile needs
   `apps/`, `packages/`, `pnpm-*` etc. — the build context is the repo root).
   Make sure `config.yaml`, `Dockerfile`, `run.sh` sit at `/addons/whattoeat/`
   (move the contents of `addon/` up to the folder root, or copy the repo and
   point the add-on at the `addon/` subfolder).
3. **Settings → Add-ons → Add-on store → ⋮ → Check for updates**. "WhatToEat"
   appears under **Local add-ons**. Click **Install** (the first build takes a
   few minutes — it installs deps and builds the web app in-container).
4. **Start**. Open the Web UI (the `8099` port) to confirm it's up on the LAN:
   `http://homeassistant.local:8099`.

> LAN-only (`http://…:8099`) works for browsing, but **the camera scanner needs
> HTTPS** on iOS — that's what the Tailscale option below is for.

## Options

| Option | What it does |
|---|---|
| `tailscale_authkey` | Paste a Tailscale **auth key** to enable the private HTTPS URL. Leave blank for LAN-only. |
| `tailscale_hostname` | The device name on your tailnet (default `whattoeat`). |
| `auth_token` | Optional. If set, the API requires this token; paste the same value into the app's **Settings → Access token** on each device. Leave blank on a trusted home network. |

## Enabling HTTPS (for the phone app + camera)

1. In the **Tailscale admin console**: enable **MagicDNS** and **HTTPS
   Certificates** (Settings → Features). Generate an **auth key** (Settings →
   Keys → Generate auth key; reusable is convenient).
2. Paste the key into the add-on's `tailscale_authkey` option, set a
   `tailscale_hostname`, **Save**, and **Restart** the add-on. Check the add-on
   **Log** — it prints the URL once Tailscale is up.
3. On your iPhone: install the **Tailscale** app and sign in to the same tailnet.
   Open `https://<hostname>.<your-tailnet>.ts.net` in Safari → **Share → Add to
   Home Screen**. The same URL works at home and away.

## Notes & troubleshooting

- **Backups**: the SQLite DB is at `/data/whattoeat.db` and is included in HA
  backups automatically.
- **`tailscale serve` failed** in the log: flag names vary by Tailscale version.
  Open a terminal in the add-on container and run `tailscale serve --help`, then
  adjust the command in `run.sh`. (The intent: background-serve HTTPS:443 →
  `http://127.0.0.1:8099`.)
- **e-ink display (P6)**: it talks to this add-on over plain LAN HTTP on `8099`,
  so it needs no Tailscale.
- This add-on **bundles its own Tailscale** on purpose — the official Home
  Assistant Tailscale add-on only serves Home Assistant itself, not other
  add-ons.
