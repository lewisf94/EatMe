import { describe, expect, it } from "vitest";
import { isValidTimezone } from "../src/services/timezone.js";

describe("timezone validation", () => {
  it("accepts real IANA zones and rejects invalid values", () => {
    expect(isValidTimezone("Europe/London")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("not/a-timezone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
});
