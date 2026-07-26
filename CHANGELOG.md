# Changelog

Notable Home Assistant app changes are recorded here.

## 0.7.4

- Allow the ARM64 and AMD64 native display renderer to be memory-mapped by the
  enforced AppArmor profile.
- Pin the Node.js and Tailscale container inputs so rebuilding a published
  version cannot silently select different base software.
- Store Tailscale's cache in the persistent writable data directory instead of
  attempting to write under `/root`.
- Build and start both supported architectures in CI, under the enforced
  AppArmor profile, and exercise health, food guidance, display rendering and
  web serving before the check passes.
- Update the installation and troubleshooting guide for the current Home
  Assistant Apps interface and the pinned Tailscale setup.
