# Build context is the repo root (config.yaml lives alongside this file, so
# Home Assistant's Supervisor builds with the whole monorepo as context —
# see addon/DOCS.md).
# ---- build stage: install deps + build the web PWA ----
ARG NODE_IMAGE="node:24.18.0-alpine3.24@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd"

FROM ${NODE_IMAGE} AS build
RUN corepack enable
WORKDIR /app

# Manifests first so the dependency layer caches across source changes.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY e2e/package.json ./e2e/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @eatme/web build

# ---- runtime stage ----
FROM ${NODE_IMAGE}

# Bundle the Tailscale binaries (userspace mode) so the add-on can put HTTPS in
# front of itself — the official HA Tailscale add-on only serves HA, not us.
COPY --from=tailscale/tailscale:v1.98.9 /usr/local/bin/tailscaled /usr/local/bin/tailscaled
COPY --from=tailscale/tailscale:v1.98.9 /usr/local/bin/tailscale /usr/local/bin/tailscale
RUN apk add --no-cache jq ca-certificates

WORKDIR /app
COPY --from=build /app ./
COPY run.sh /run.sh
# The Home Assistant builder can preserve this optional ARM/x64 dependency
# without its executable bit. tsx starts esbuild on boot, so restore that bit
# while creating the image rather than crash-looping the add-on at runtime.
RUN chmod 755 /run.sh \
 && chmod 755 /app/node_modules/.pnpm/@esbuild+linux-*/node_modules/@esbuild/linux-*/bin/esbuild

# Supervisor supplies these build arguments. Defaults keep standalone Docker
# builds labelled as Home Assistant apps as well.
ARG BUILD_VERSION="dev"
ARG BUILD_ARCH="amd64"
LABEL io.hass.version="${BUILD_VERSION}" \
      io.hass.type="app" \
      io.hass.arch="${BUILD_ARCH}" \
      org.opencontainers.image.title="EatMe" \
      org.opencontainers.image.description="Self-hosted household food inventory with freshness guidance" \
      org.opencontainers.image.source="https://github.com/lewisf94/EatMe" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    DATA_DIR=/data \
    WEB_DIST=/app/apps/web/dist \
    MIGRATIONS_DIR=/app/apps/server/migrations \
    PORT=8099

EXPOSE 8099
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8099/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
# Start the POSIX script through Alpine's shell. This avoids depending on a
# kernel shebang transition when Home Assistant's AppArmor profile is active.
CMD ["/bin/sh", "/run.sh"]
