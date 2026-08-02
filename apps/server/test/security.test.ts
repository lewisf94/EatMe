import { describe, expect, it } from "vitest";
import { bearerCredential, browserOriginMatches, secretMatches } from "../src/services/security.js";

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
