export const config = {
  port: Number(process.env.PORT ?? 8099),
  dataDir: process.env.DATA_DIR ?? "./data",
  offUserAgent: process.env.OFF_USER_AGENT ?? "EatMe/0.1 (github.com/lewisf94/EatMe)",
  /** When set, /api/* requires `Authorization: Bearer <token>` (wired up in P4). */
  authToken: process.env.AUTH_TOKEN ?? "",
  /** Receipt OCR engine: "stub" (fixed, for dev/CI) or "local" (EatMe OCR app). */
  receiptProvider: process.env.RECEIPT_PROVIDER ?? "stub",
  /** Base URL of the private OCR service (used when provider = local). */
  ocrUrl: process.env.OCR_URL ?? "http://localhost:8765",
  /** When set, /api/display.png needs ?token= — the e-ink panel's own gate, so
   *  the display keeps working when AUTH_TOKEN locks down the rest of the API. */
  displayToken: process.env.DISPLAY_TOKEN ?? "",
  /** Contact address pushed to the VAPID service (spec wants a mailto/URL). */
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:eatme@localhost",
};
