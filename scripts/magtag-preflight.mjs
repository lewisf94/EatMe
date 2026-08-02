#!/usr/bin/env node

const WIDTH = 296;
const HEIGHT = 128;
const BITS_PER_PIXEL = 4;
const TIMEOUT_MS = 15_000;

function usage() {
  console.log(`Usage: node scripts/magtag-preflight.mjs <server-url> [--full]

Environment:
  EATME_MAGTAG_TOKEN  Device token configured as magtag_token in the add-on

Options:
  --full  Also verify token rejection and write test status/button telemetry
  --help  Show this help

Example (PowerShell):
  $env:EATME_MAGTAG_TOKEN="your-device-token"
  node .\\scripts\\magtag-preflight.mjs http://homeassistant.local:8099 --full`);
}

function endpoint(baseUrl, path, token, query = {}) {
  const url = new URL(path.replace(/^\//, ""), baseUrl);
  if (token) url.searchParams.set("token", token);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function expectStatus(url, expected, options = {}) {
  const response = await fetchWithTimeout(url, options);
  if (response.status !== expected) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(
      `${options.method ?? "GET"} ${url.pathname} returned ${response.status}; expected ${expected}${
        detail ? `: ${detail}` : ""
      }`,
    );
  }
  return response;
}

function inspectBitmap(payload) {
  if (payload.length < 54 || payload.toString("ascii", 0, 2) !== "BM") {
    throw new Error("response is not a BMP file");
  }

  const declaredSize = payload.readUInt32LE(2);
  const width = payload.readInt32LE(18);
  const height = payload.readInt32LE(22);
  const bitsPerPixel = payload.readUInt16LE(28);

  if (declaredSize !== payload.length) {
    throw new Error(`BMP length is ${payload.length} bytes but header declares ${declaredSize}`);
  }
  if (width !== WIDTH || height !== HEIGHT || bitsPerPixel !== BITS_PER_PIXEL) {
    throw new Error(
      `BMP is ${width}x${height} at ${bitsPerPixel}bpp; expected ${WIDTH}x${HEIGHT} at ${BITS_PER_PIXEL}bpp`,
    );
  }
}

async function checkBitmap(baseUrl, path, token, query) {
  const url = endpoint(baseUrl, path, token, query);
  const response = await expectStatus(url, 200);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("image/bmp")) {
    throw new Error(`${path} returned content-type ${contentType || "(missing)"}`);
  }
  if (response.headers.get("cache-control") !== "no-store") {
    throw new Error(`${path} did not return cache-control: no-store`);
  }

  inspectBitmap(Buffer.from(await response.arrayBuffer()));
  console.log(`[ok] ${path} -> ${WIDTH}x${HEIGHT}, ${BITS_PER_PIXEL}bpp BMP`);
}

async function postJson(baseUrl, path, token, payload, expected = 200) {
  const response = await expectStatus(endpoint(baseUrl, path, token), expected, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (expected === 200) {
    const body = await response.json();
    if (body?.data?.ok !== true) {
      throw new Error(`${path} returned an unexpected response body`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  const full = args.includes("--full");
  const unknownFlags = args.filter((arg) => arg.startsWith("-") && arg !== "--full");
  const positional = args.filter((arg) => !arg.startsWith("-"));
  if (unknownFlags.length > 0 || positional.length !== 1) {
    usage();
    process.exitCode = 2;
    return;
  }

  let baseUrl;
  try {
    baseUrl = new URL(positional[0].endsWith("/") ? positional[0] : `${positional[0]}/`);
  } catch {
    throw new Error(`Invalid server URL: ${positional[0]}`);
  }
  if (!/^https?:$/.test(baseUrl.protocol)) {
    throw new Error("Server URL must use http:// or https://");
  }

  const token = process.env.EATME_MAGTAG_TOKEN?.trim() ?? "";
  console.log(`Checking EatMe MagTag API at ${baseUrl.origin}${baseUrl.pathname}`);

  if (full && token) {
    await expectStatus(endpoint(baseUrl, "/api/magtag/display.bmp", ""), 401);
    await expectStatus(endpoint(baseUrl, "/api/magtag/display.bmp", "preflight-wrong-token"), 401);
    console.log("[ok] missing and invalid device tokens are rejected");
  } else if (full) {
    console.log("[skip] token rejection (EATME_MAGTAG_TOKEN is not set)");
  }

  await checkBitmap(baseUrl, "/api/magtag/display.bmp", token, full ? { battery: 77 } : undefined);
  await checkBitmap(baseUrl, "/api/magtag/page/urgent", token);
  await checkBitmap(baseUrl, "/api/magtag/page/recipe", token);
  await checkBitmap(baseUrl, "/api/magtag/page/shopping", token);

  await expectStatus(endpoint(baseUrl, "/api/magtag/page/not-a-page", token), 404);
  console.log("[ok] unknown pages are rejected");

  if (full) {
    await postJson(baseUrl, "/api/magtag/status", token, {
      battery: 77,
      wakeReason: "preflight",
      firmware: "preflight",
      rssi: -50,
    });
    console.log("[ok] status and battery telemetry accepted");

    await postJson(baseUrl, "/api/magtag/button", token, { button: "refresh" });
    await postJson(baseUrl, "/api/magtag/button", token, { button: "not-a-button" }, 400);
    console.log("[ok] valid button accepted and invalid button rejected");
  }

  console.log(
    full
      ? "MagTag full preflight passed."
      : "MagTag image preflight passed (use --full for write checks).",
  );
}

main().catch((error) => {
  console.error(
    `MagTag preflight failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
