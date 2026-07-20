# Build context is the repo root (see build note in addon/DOCS.md).
# ---- build stage: install deps + build the web PWA ----
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app

# Manifests first so the dependency layer caches across source changes.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/server/package.json ./apps/server/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @whattoeat/web build

# ---- runtime stage ----
FROM node:24-alpine

# Bundle the Tailscale binaries (userspace mode) so the add-on can put HTTPS in
# front of itself — the official HA Tailscale add-on only serves HA, not us.
COPY --from=tailscale/tailscale:stable /usr/local/bin/tailscaled /usr/local/bin/tailscaled
COPY --from=tailscale/tailscale:stable /usr/local/bin/tailscale /usr/local/bin/tailscale
RUN apk add --no-cache jq ca-certificates

WORKDIR /app
COPY --from=build /app ./
COPY addon/run.sh /run.sh
RUN chmod +x /run.sh

ENV NODE_ENV=production \
    DATA_DIR=/data \
    WEB_DIST=/app/apps/web/dist \
    MIGRATIONS_DIR=/app/apps/server/migrations \
    PORT=8099

EXPOSE 8099
CMD ["/run.sh"]
