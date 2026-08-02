import { describe, expect, it } from "vitest";
import { bearerCredential, secretMatches } from "../src/services/security.js";

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
});
