function configuredPort(): number {
  const value = Number(process.env.PORT ?? 8099);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return value;
}

function configuredReceiptProvider(): "stub" | "local" {
  const value = process.env.RECEIPT_PROVIDER ?? "stub";
  if (value !== "stub" && value !== "local") {
    throw new Error('RECEIPT_PROVIDER must be either "stub" or "local"');
  }
  return value;
}

function configuredHttpUrl(name: string, fallback: string): string {
  const raw = process.env[name]?.trim() || fallback;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid http:// or https:// URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use http:// or https://`);
  }
  return raw.replace(/\/+$/, "");
}

export const config = {
  port: configuredPort(),
  dataDir: process.env.DATA_DIR ?? "./data",
  offUserAgent: process.env.OFF_USER_AGENT ?? "EatMe/0.1 (github.com/lewisf94/EatMe)",
  /** When set, /api/* requires `Authorization: Bearer <token>` (wired up in P4). */
  authToken: process.env.AUTH_TOKEN ?? "",
  /** Receipt OCR engine: "stub" (fixed, for dev/CI) or "local" (EatMe OCR app). */
  receiptProvider: configuredReceiptProvider(),
  /** Base URL of the private OCR service (used when provider = local). */
  ocrUrl: configuredHttpUrl("OCR_URL", "http://localhost:8765"),
  /** When set, /api/display.png needs ?token= — the e-ink panel's own gate, so
   *  the display keeps working when AUTH_TOKEN locks down the rest of the API. */
  displayToken: process.env.DISPLAY_TOKEN ?? "",
  /** When set, /api/magtag/* needs ?token= — a device-scoped credential so the
   *  MagTag never carries a Home Assistant administrator token. */
  magtagToken: process.env.MAGTAG_TOKEN ?? "",
  /** Contact address pushed to the VAPID service (spec wants a mailto/URL). */
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:eatme@localhost",
};
