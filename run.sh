#!/usr/bin/env sh
# Home Assistant add-on entrypoint: optionally bring up Tailscale HTTPS, then
# start the server. Add-on options are written by the Supervisor to
# /data/options.json.
set -e

OPTIONS=/data/options.json
opt() { jq -r ".$1 // empty" "$OPTIONS" 2>/dev/null; }

export AUTH_TOKEN="$(opt auth_token)"
export RECEIPT_PROVIDER="$(opt receipt_provider)"
export OCR_URL="$(opt ocr_url)"
TS_AUTHKEY="$(opt tailscale_authkey)"
TS_HOSTNAME="$(opt tailscale_hostname)"
[ -z "$TS_HOSTNAME" ] && TS_HOSTNAME="eatme"

if [ -n "$TS_AUTHKEY" ]; then
  echo "[eatme] starting tailscaled in userspace mode"
  mkdir -p /data/tailscale /var/run/tailscale
  tailscaled \
    --tun=userspace-networking \
    --state=/data/tailscale/tailscaled.state \
    --socket=/var/run/tailscale/tailscaled.sock &

  # wait for the control socket
  i=0
  while [ ! -S /var/run/tailscale/tailscaled.sock ] && [ "$i" -lt 30 ]; do
    i=$((i + 1))
    sleep 1
  done

  tailscale up --authkey="$TS_AUTHKEY" --hostname="$TS_HOSTNAME"

  echo "[eatme] enabling HTTPS with tailscale serve"
  # Current Tailscale Serve selects the HTTPS listener automatically.
  # Older flag forms are retained as fallbacks for previously built images.
  tailscale serve --bg http://127.0.0.1:8099 \
    || tailscale serve --bg --https=443 http://127.0.0.1:8099 \
    || tailscale serve --bg https / http://127.0.0.1:8099 \
    || echo "[eatme] tailscale serve failed; see 'tailscale serve --help' and adjust run.sh"

  echo "[eatme] app URL: https://${TS_HOSTNAME}.<your-tailnet>.ts.net"
fi

echo "[eatme] starting server on :8099"
# tsx is a server-workspace dependency, not a root dependency. Run its CLI
# directly so this works in the packaged add-on as well as from the source tree.
exec node /app/apps/server/node_modules/tsx/dist/cli.mjs /app/apps/server/src/index.ts
