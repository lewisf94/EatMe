import { describe, expect, it } from "vitest";
import {
  FailureLimiter,
  bearerCredential,
  browserOriginMatches,
  hostAllowed,
  secretMatches,
  weakToken,
} from "../src/services/security.js";
import { isPushServiceEndpoint } from "../src/services/push-rules.js";

describe("credential handling", () => {
  it("matches only the complete secret", () => {
    expect(secretMatches("device-secret", "device-secret")).toBe(true);
    expect(secretMatches("device-secreu", "device-secret")).toBe(false);
    expect(secretMatches("device", "device-secret")).toBe(false);
    expect(secretMatches(undefined, "device-secret")).toBe(false);
  });

  it("parses bearer credentials case-insensitively", () => {
    expect(bearerCredential("Bearer admin-secret")).toBe("admin-secret");
    expect(bearerCredential("bearer admin-secret")).toBe("admin-secret");
    expect(bearerCredential("Basic admin-secret")).toBe("");
  });

  it("accepts only the request host for browser-origin writes", () => {
    expect(browserOriginMatches("https://eatme.example", "https", ["eatme.example"])).toBe(true);
    expect(
      browserOriginMatches("https://evil.example", "https", ["eatme.example", "localhost:8099"]),
    ).toBe(false);
    expect(browserOriginMatches("not a URL", "http", ["localhost:8099"])).toBe(false);
  });
});

describe("host allowlist", () => {
  it("accepts LAN addresses and private names", () => {
    for (const host of [
      "192.168.1.10:8099",
      "127.0.0.1",
      "[::1]:8099",
      "localhost:8099",
      "homeassistant:8099",
      "homeassistant.local:8099",
      "eatme.tail1234.ts.net",
      "nas.home.arpa",
    ])
      expect(hostAllowed(host), host).toBe(true);
  });

  it("rejects public names unless listed", () => {
    expect(hostAllowed("evil.example:8099")).toBe(false);
    expect(hostAllowed("eatme.example.ts.net.evil.com")).toBe(false);
    expect(hostAllowed(undefined)).toBe(false);
    expect(hostAllowed("eatme.example.com", ["eatme.example.com"])).toBe(true);
    expect(hostAllowed("a.example.com:443", [".example.com"])).toBe(true);
    expect(hostAllowed("example.com.evil.net", [".example.com"])).toBe(false);
  });
});

describe("failed credential limiter", () => {
  it("blocks a client after the limit until the window ends", () => {
    const limiter = new FailureLimiter(3, 1_000);
    for (let i = 0; i < 3; i++) limiter.fail("a", 0);
    expect(limiter.blocked("a", 10)).toBe(true);
    expect(limiter.blocked("b", 10)).toBe(false);
    expect(limiter.blocked("a", 1_001)).toBe(false);
  });

  it("flags short tokens only", () => {
    expect(weakToken("")).toBe(false);
    expect(weakToken("short")).toBe(true);
    expect(weakToken("a-long-random-token-value")).toBe(false);
  });
});

describe("push endpoint allowlist", () => {
  it("accepts browser push services on the default port", () => {
    expect(isPushServiceEndpoint("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(isPushServiceEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(
      true,
    );
    expect(isPushServiceEndpoint("https://web.push.apple.com/x")).toBe(true);
  });

  it("rejects internal, look-alike and non-default-port endpoints", () => {
    expect(isPushServiceEndpoint("https://10.0.0.1/x")).toBe(false);
    expect(isPushServiceEndpoint("https://fcm.googleapis.com.evil.net/x")).toBe(false);
    expect(isPushServiceEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(isPushServiceEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isPushServiceEndpoint("https://localhost:9/x", ["localhost"])).toBe(true);
  });
});
