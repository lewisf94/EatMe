import { describe, expect, it } from "vitest";
import { redactRequestUrl } from "../src/services/logging.js";

describe("request log redaction", () => {
  it("redacts device tokens without hiding useful request details", () => {
    expect(redactRequestUrl("/api/magtag/display.bmp?token=secret&battery=77")).toBe(
      "/api/magtag/display.bmp?token=[REDACTED]&battery=77",
    );
    expect(redactRequestUrl("/api/display.png?battery=55&token=a%26b")).toBe(
      "/api/display.png?battery=55&token=[REDACTED]",
    );
  });

  it("leaves URLs without a token unchanged", () => {
    expect(redactRequestUrl("/api/health")).toBe("/api/health");
  });

  it("redacts unexpected non-string values safely", () => {
    expect(redactRequestUrl(undefined)).toBe("[REDACTED]");
  });
});
