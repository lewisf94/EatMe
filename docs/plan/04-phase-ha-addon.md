# P4 · Home Assistant add-on + bundled Tailscale HTTPS

**Goal:** package the whole thing as a **local Home Assistant add-on** that runs on Lewis's Pi, persists to `/data` (inside HA backups), and exposes a **real HTTPS URL reachable from the iPhone at home and away** — which the camera (P3) and Web Push (P8) require.

**Prerequisites:** P1–P3 green. Much of the verification here is 🖐 **manual on the Pi** — do everything automatable (build the image, boot the container locally), then hand Lewis a tested, documented install.

## The constraint that dictates this design (verified — see research-notes)

The official HA **Tailscale add-on only fronts Home Assistant itself** (ports 443/8443/10000) and won't reverse-proxy our add-on or share its cert. So **our add-on bundles its own `tailscaled`** (userspace networking) and runs `tailscale serve` to put HTTPS in front of our Node server. Nothing is exposed to the public internet (Serve = tailnet-only; not Funnel).

## Deliverables

1. Multi-stage **Dockerfile** building server + web into one image.
2. HA add-on **`config.yaml`** + **`build.yaml`**.
3. A **`run.sh`** entrypoint that starts `tailscaled` + `tailscale serve` (if an auth key is set) and then the Node server.
4. Production build wiring: server serves the prebuilt web `dist`; `migrations/` resolves in the container.
5. **`addon/DOCS.md`** — copy-paste install + Tailscale setup instructions for Lewis.

## Layout

```
addon/
├── config.yaml
├── build.yaml
├── Dockerfile
├── run.sh
└── DOCS.md
apps/server/src/config.ts   # add AUTH_TOKEN; default DATA_DIR "/data" when present
```

## `config.yaml`

```yaml
name: WhatToEat
slug: whattoeat
version: "0.4.0"
description: Food inventory for jars, spices and the back of the cupboard
arch: [aarch64, amd64]
init: false
startup: application
boot: auto
ports:
  8099/tcp: 8099        # optional LAN access; the e-ink display (P6) uses this
ports_description:
  8099/tcp: WhatToEat web/API (LAN + e-ink display)
webui: "http://[HOST]:[PORT:8099]"
watchdog: "http://[HOST]:[PORT:8099]/api/health"
map:
  - type: data          # /data — persisted, included in HA backups
    read_only: false
options:
  auth_token: ""
  tailscale_authkey: ""
  tailscale_hostname: "whattoeat"
schema:
  auth_token: str?
  tailscale_authkey: password?
  tailscale_hostname: str?
```
> `map:` uses the current list-of-objects form (`type: data`). If the Supervisor on Lewis's HA version wants the older `map: ["data:rw"]` string form, use that — check the add-on it accepts and note it. Data at `/data` is the only persistence we need.

## `build.yaml`

Pin HA base images per arch (Alpine + Node). Simplest reliable route: use an official Node image as the `FROM` in the Dockerfile and keep `build.yaml` minimal, or use HA's Node base build args. Example using HA base:
```yaml
build_from:
  aarch64: ghcr.io/hassio-addons/base:stable
  amd64: ghcr.io/hassio-addons/base:stable
```
Then install Node 24 in the Dockerfile. **Simpler alternative (recommended):** skip HA bases and `FROM node:24-alpine` directly — fewer moving parts, and `@resvg/resvg-js` + `node:sqlite` both work on alpine/arm64. Choose one and keep it.

## Dockerfile (recommended `node:24-alpine` route)

```dockerfile
# ---- build ----
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @whattoeat/web build
RUN pnpm --filter @whattoeat/server build     # tsc → apps/server/dist
RUN pnpm deploy --filter @whattoeat/server --prod /out   # prod node_modules + dist

# ---- runtime ----
FROM node:24-alpine
RUN apk add --no-cache ca-certificates iptables curl && \
    curl -fsSL https://pkgs.tailscale.com/stable/tailscale_latest_arm64.tgz -o /tmp/ts.tgz || true
# ^ prefer installing tailscale via apk (community repo) or copy the static binaries for the
#   target arch. VERIFY the arch (arm64 on Pi, amd64 on dev) — see run.sh notes.
WORKDIR /app
COPY --from=build /out /app
COPY --from=build /app/apps/web/dist /app/web-dist
COPY --from=build /app/apps/server/migrations /app/migrations
COPY addon/run.sh /run.sh
RUN chmod +x /run.sh
ENV WEB_DIST=/app/web-dist  DATA_DIR=/data  NODE_ENV=production  PORT=8099
EXPOSE 8099
CMD ["/run.sh"]
```
> The tailscale binary install is the fiddly bit. Cleanest options, in order: (1) `apk add tailscale` if available in the alpine repos for the arch; (2) copy `tailscaled`+`tailscale` from the official `tailscale/tailscale` image via a `COPY --from=tailscale/tailscale:stable /usr/local/bin/ ...` stage; (3) download the static tarball for the **correct arch** and extract. Pick one, pin a version, and record it. Do **not** leave the `|| true` curl in the final image.

## `run.sh`

```sh
#!/usr/bin/env sh
set -e
# read HA add-on options (Supervisor writes /data/options.json)
AUTHKEY=$(jq -r '.tailscale_authkey // ""' /data/options.json 2>/dev/null || echo "")
HOSTNAME=$(jq -r '.tailscale_hostname // "whattoeat"' /data/options.json 2>/dev/null || echo whattoeat)
export AUTH_TOKEN=$(jq -r '.auth_token // ""' /data/options.json 2>/dev/null || echo "")

if [ -n "$AUTHKEY" ]; then
  mkdir -p /data/tailscale
  tailscaled --tun=userspace-networking --state=/data/tailscale/tailscaled.state \
             --socket=/var/run/tailscale/tailscaled.sock &
  sleep 2
  tailscale up --authkey="$AUTHKEY" --hostname="$HOSTNAME"
  # Put HTTPS in front of the Node server. VERIFY flags with `tailscale serve --help`.
  tailscale serve --bg --https=443 http://127.0.0.1:8099 || \
  tailscale serve --bg 8099   # fallback older syntax; confirm which your version accepts
fi

exec node /app/apps/server/dist/index.js
```
> `jq` must be in the image (`apk add jq`). Requires MagicDNS + HTTPS certs enabled on the tailnet (documented in DOCS.md). `tailscale serve` needs the container to have the right caps; if it fails under the Supervisor's sandbox, the fallback path is Nabu Casa ingress (add `ingress: true` + `ingress_port`) for a read-only-at-home experience, but Serve is the target. Record whatever works.

## Server changes

- `config.ts`: `dataDir = process.env.DATA_DIR ?? "./data"`; `authToken = process.env.AUTH_TOKEN ?? ""`.
- Add an `onRequest` hook: **if `authToken` is set**, require `Authorization: Bearer <token>` on `/api/*` (allow `/api/health` and the display endpoint's own token later). If empty, auth is off (LAN-trust default). The web app stores the token once in `localStorage` (a Settings field) and sends it.
- `build` script for server: `tsc -p apps/server` → `dist/`. Ensure `migrations/` is read from `/app/migrations` in prod (env `MIGRATIONS_DIR`, default resolves next to `src` in dev, `/app/migrations` in the container).

## `addon/DOCS.md` (write this for Lewis)

Cover, in copy-paste form: install the **SSH & Web Terminal** or **Samba** add-on → drop the `addon/` folder into `/addons/whattoeat` (or add this GitHub repo as a custom add-on repository) → it appears under Settings → Add-ons → Local → Install. Then: create a **Tailscale auth key** (tailnet admin console), enable **MagicDNS + HTTPS certificates**, paste the key + hostname into the add-on config, Start. The app is then at `https://whattoeat.<your-tailnet>.ts.net`. Install the Tailscale app on the iPhone, open that URL, Add to Home Screen. LAN-only fallback: `http://homeassistant.local:8099` (no camera without HTTPS).

## Acceptance checklist

- [ ] `docker build -f addon/Dockerfile -t whattoeat .` succeeds (build it for amd64 locally at least).
- [ ] `docker run -p 8099:8099 -v $PWD/data:/data whattoeat` boots; `/api/health` responds; data persists in the mounted volume across `docker run`s.
- [ ] With `AUTH_TOKEN` set (env), `/api/*` returns 401 without the bearer header and 200 with it; `/api/health` stays open.
- [ ] The container serves the **built web app** at `/` (no Vite).
- [ ] 🖐 On the Pi: add-on installs from Local, starts, watchdog healthy, survives a reboot, appears in an HA backup's contents.
- [ ] 🖐 With a Tailscale auth key set: `https://whattoeat.<tailnet>.ts.net` loads with a valid cert; the iPhone can install the PWA and **the camera scanner now works** (closes the deferred P3 box).

## Definition of done

Runs as a real HA add-on with persistent data and HTTPS to the phone. Commit `P4: Home Assistant add-on with bundled Tailscale HTTPS`. **Stop.**
