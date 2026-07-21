#!/usr/bin/env sh
# Home Assistant add-on entrypoint: optionally bring up Tailscale HTTPS, then
# start the server. Add-on options are written by the Supervisor to
# /data/options.json.
set -e

OPTIONS=/data/options.json
opt() { jq -r ".$1 // empty" "$OPTIONS" 2>/dev/null; }

export AUTH_TOKEN="$(opt auth_token)"
TS_AUTHKEY="$(opt tailscale_authkey)"
TS_HOSTNAME="$(opt tailscale_hostname)"
[ -z "$TS_HOSTNAME" ] && TS_HOSTNAME="eatme"

if [ -n "$TS_AUTHKEY" ]; then
  echo "[eatme] starting tailscaled (userspace networking)…"
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

  echo "[eatme] enabling HTTPS via 'tailscale serve'…"
  # Flag spellings drift between Tailscale versions — try the current form,
  # then older fallbacks. Confirm with 'tailscale serve --help' if all fail.
  tailscale serve --bg --https=443 http://127.0.0.1:8099 \
    || tailscale serve --bg https / http://127.0.0.1:8099 \
    || tailscale serve --bg 8099 \
    || echo "[eatme] 'tailscale serve' failed — see 'tailscale serve --help' and adjust run.sh"

  echo "[eatme] app URL (once MagicDNS+HTTPS are on): https://${TS_HOSTNAME}.<your-tailnet>.ts.net"
fi

echo "[eatme] starting server on :8099"
exec node_modules/.bin/tsx apps/server/src/index.ts
