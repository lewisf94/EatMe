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

[ -z "$RECEIPT_PROVIDER" ] && export RECEIPT_PROVIDER="local"

if [ "$RECEIPT_PROVIDER" = "local" ] && [ -z "$OCR_URL" ]; then
  # Home Assistant names repository apps <repo>-<slug>. Derive the sibling OCR
  # hostname from this app's own hostname so this works for GitHub and /addons
  # installations without hard-coding the repository hash.
  APP_HOSTNAME="$(hostname)"
  REPO_PREFIX="${APP_HOSTNAME%-eatme}"
  export OCR_URL="http://${REPO_PREFIX}-eatme-ocr:8765"
  echo "[eatme] local receipt OCR: ${OCR_URL}"
elif [ "$RECEIPT_PROVIDER" = "stub" ]; then
  echo "[eatme] receipt OCR is in demonstration mode; every photo returns fixed sample data"
fi

TS_AUTHKEY="$(opt tailscale_authkey)"
TS_HOSTNAME="$(opt tailscale_hostname)"
TS_STATE=/data/tailscale/tailscaled.state
TS_CACHE=/data/tailscale/cache
TS_HAD_STATE=0
[ -s "$TS_STATE" ] && TS_HAD_STATE=1
[ -z "$TS_HOSTNAME" ] && TS_HOSTNAME="eatme"

if [ -n "$TS_AUTHKEY" ] || [ -s "$TS_STATE" ]; then
  echo "[eatme] starting tailscaled in userspace mode"
  # Tailscale uses XDG_CACHE_HOME on Linux. Keeping its cache under /data avoids
  # harmless AppArmor warnings about the read-only /root directory.
  export XDG_CACHE_HOME="$TS_CACHE"
  mkdir -p /data/tailscale "$TS_CACHE" /var/run/tailscale
  tailscaled \
    --tun=userspace-networking \
    --state="$TS_STATE" \
    --socket=/var/run/tailscale/tailscaled.sock &

  # wait for the control socket
  i=0
  while [ ! -S /var/run/tailscale/tailscaled.sock ] && [ "$i" -lt 30 ]; do
    i=$((i + 1))
    sleep 1
  done

  if [ "$TS_HAD_STATE" -eq 1 ]; then
    echo "[eatme] reusing the saved tailscale identity"
    if ! tailscale up --hostname="$TS_HOSTNAME"; then
      if [ -n "$TS_AUTHKEY" ]; then
        echo "[eatme] saved identity needs re-enrolling"
        tailscale up --authkey="$TS_AUTHKEY" --hostname="$TS_HOSTNAME"
      else
        echo "[eatme] saved tailscale identity could not connect; add a new auth key"
        exit 1
      fi
    fi
  else
    echo "[eatme] enrolling this app with tailscale"
    tailscale up --authkey="$TS_AUTHKEY" --hostname="$TS_HOSTNAME"
  fi

  echo "[eatme] enabling HTTPS with tailscale serve"
  # Serve configuration persists across restarts. Clear any rule created by an
  # earlier app version before publishing the current reverse proxy rule.
  tailscale serve reset || true
  # Current Tailscale Serve selects the HTTPS listener automatically.
  tailscale serve --bg http://127.0.0.1:8099 \
    || echo "[eatme] tailscale serve failed; see 'tailscale serve --help' and adjust run.sh"

  echo "[eatme] app URL: https://${TS_HOSTNAME}.<your-tailnet>.ts.net"
fi

echo "[eatme] starting server on :8099"
# tsx is a server-workspace dependency, not a root dependency. Run its CLI
# directly so this works in the packaged add-on as well as from the source tree.
exec node /app/apps/server/node_modules/tsx/dist/cli.mjs /app/apps/server/src/index.ts
