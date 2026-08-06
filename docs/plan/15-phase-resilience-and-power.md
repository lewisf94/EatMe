# RX: Resilience and MagTag power

**Status:** implemented and verified in EatMe 0.10.0.

## Goal

Reduce unnecessary MagTag work, make recovery from accidental database damage
easier and close browser-side request boundaries without changing EatMe's local,
single-household model.

## Design

- Cache each server-rendered MagTag page until its meaningful contents change.
  Footer time and battery alone do not dirty the page; health telemetry still
  records the current battery on every wake.
- Return a strong ETag and retain its 16-character digest in CircuitPython deep
  sleep memory. Scheduled checks send `If-None-Match`; Button D remains a forced
  refresh.
- Store automatic JSON snapshots under `/data/backups` through a temporary file
  and same-directory rename. Keep the latest 1â€“30 exact, versioned backups.
- Accept state-changing requests with an `Origin` header only when it matches
  the effective request host. Device and command-line clients without a browser
  Origin continue to work.
- Send a restrictive Content Security Policy (with WebAssembly compilation only
  for the bundled scanner), permissions policy, anti-framing headers and HSTS
  only when the request is already HTTPS.

## Acceptance checklist

- [x] Repeating an unchanged MagTag request with its ETag returns 304 and no body.
- [x] Battery telemetry is recorded even when the page returns 304.
- [x] Firmware retains the validator without writing CIRCUITPY flash.
- [x] Manual refresh bypasses conditional fetching.
- [x] Automatic snapshots are valid EatMe backups and prune oldest-first.
- [x] A failed write cannot leave a valid-looking partial snapshot.
- [x] Cross-origin browser writes are rejected while same-origin writes succeed.
- [x] Type checks, server tests, production build and browser tests pass.

## Hardware verification

- [ ] Confirm a second unchanged timer wake does not flash the e-paper panel.
- [ ] Compare wake duration and current for HTTP 200 versus HTTP 304 cycles.
- [ ] Complete the existing 50-cycle MagTag reliability run.
