import { createHash, timingSafeEqual } from "node:crypto";

/** Compare credentials without making the first differing character observable
 * through response timing. Hashing first also gives timingSafeEqual fixed-size
 * buffers even when a malformed request sends the wrong token length. */
export function secretMatches(actual: unknown, expected: string): boolean {
  const actualHash = createHash("sha256")
    .update(typeof actual === "string" ? actual : "")
    .digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

export function bearerCredential(header: string | undefined): string {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return match?.[1] ?? "";
}

/** Reject cross-site browser writes while leaving non-browser devices and CLI
 *  clients alone. Browsers set Origin themselves; MagTag and HA API calls do
 *  not, so this adds CSRF protection without another device credential. */
export function browserOriginMatches(
  origin: string,
  protocol: string,
  hosts: Array<string | string[] | undefined>,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  return hosts
    .flatMap((host) => (Array.isArray(host) ? host : [host]))
    .flatMap((host) => host?.split(",") ?? [])
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
    .some((host) => parsed.origin.toLowerCase() === `${protocol}://${host}`.toLowerCase());
}
