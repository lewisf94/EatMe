import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

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

// Names a public DNS record cannot answer for, so a page served from one of
// them cannot be a DNS-rebinding attacker. Single-label names (homeassistant,
// the Supervisor's container names) are covered separately below.
const PRIVATE_SUFFIXES = [".localhost", ".local", ".lan", ".home.arpa", ".internal", ".ts.net"];

/** Strip the port from a Host value ("[::1]:8099" → "::1", "a.b:80" → "a.b"). */
export function hostName(host: string): string {
  const value = host.trim().toLowerCase();
  if (value.startsWith("[")) return value.slice(1, value.indexOf("]"));
  // A bare IPv6 address has several colons and no port.
  if (value.split(":").length > 2) return value;
  return value.replace(/:\d*$/, "").replace(/\.$/, "");
}

/** DNS-rebinding guard. A malicious site that re-points its own name at this
 *  server makes the browser send its name as Host and Origin together, which
 *  passes a plain same-origin check. Accept only addresses and names an
 *  outside site cannot control, plus names the household lists explicitly. */
export function hostAllowed(host: string | undefined, extra: readonly string[] = []): boolean {
  if (!host) return false;
  const name = hostName(host);
  if (!name) return false;
  if (isIP(name)) return true;
  if (name === "localhost" || !name.includes(".")) return true;
  if (PRIVATE_SUFFIXES.some((suffix) => name.endsWith(suffix))) return true;
  return extra.some((allowed) =>
    allowed.startsWith(".") ? name.endsWith(allowed) : name === allowed,
  );
}

/** Count failed credential checks per client so a LAN device cannot guess a
 *  token at full request speed. Memory stays bounded: expired windows are
 *  dropped, and the table is cleared outright if it ever grows past maxClients. */
export class FailureLimiter {
  private readonly failures = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit = 20,
    private readonly windowMs = 5 * 60_000,
    private readonly maxClients = 10_000,
  ) {}

  blocked(client: string, now = Date.now()): boolean {
    const entry = this.failures.get(client);
    if (!entry) return false;
    if (entry.resetAt <= now) {
      this.failures.delete(client);
      return false;
    }
    return entry.count >= this.limit;
  }

  fail(client: string, now = Date.now()): void {
    if (this.failures.size >= this.maxClients) {
      for (const [key, value] of this.failures) if (value.resetAt <= now) this.failures.delete(key);
      if (this.failures.size >= this.maxClients) this.failures.clear();
    }
    const entry = this.failures.get(client);
    if (!entry || entry.resetAt <= now) {
      this.failures.set(client, { count: 1, resetAt: now + this.windowMs });
    } else {
      entry.count++;
    }
  }
}

/** One shared limiter for the admin token and both device tokens. */
export const authFailures = new FailureLimiter();

/** Startup check: a short token is guessable even with rate limiting. */
export function weakToken(token: string): boolean {
  return token.length > 0 && token.length < 20;
}
