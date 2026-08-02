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
