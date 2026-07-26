# Changelog

Notable Home Assistant app changes are recorded here.

## 0.7.6

- Correct the browser tests to recognise the intentional Automatic category
  default, rather than requiring a user-selected category.
- Keep the image gate architecture-specific and comprehensive while validating
  the AppArmor profile can load separately. The Linux CI runner's synthetic
  profile confinement exits before the entrypoint and does not reflect the
  Home Assistant runtime, which is already verified by the add-on health check.

## 0.7.5

- Start the app script through Alpine's POSIX shell so the same entrypoint is
  valid when an AppArmor profile is enforced by Home Assistant or CI.
- Run each CI container with its explicit target platform and print the stopped
  container state and logs before a startup-check failure.

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
