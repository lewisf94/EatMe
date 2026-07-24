import { describe, it, expect } from "vitest";
import {
  buildDashboardSvg,
  renderPng,
  urgencyPhrase,
  assertFontsPresent,
  DISPLAY_W,
  DISPLAY_H,
  type DashboardData,
} from "../src/services/display.js";

const base: DashboardData = { urgent: [], lowStock: 0, rendered: "Fri 24 Jul, 08:00" };

/** PNG header: 8-byte signature, then IHDR carries width/height as big-endian. */
function pngSize(buf: Buffer): { w: number; h: number } {
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(buf.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe("display phrases", () => {
  it("separates safety from quality, and speaks in days", () => {
    expect(urgencyPhrase({ status: "past_use_by", pressureKind: "use_by", daysLeft: -3 })).toBe(
      "USE BY passed 3d ago",
    );
    expect(urgencyPhrase({ status: "past_best", pressureKind: "best_before", daysLeft: -2 })).toBe(
      "Past its best by 2d",
    );
    expect(urgencyPhrase({ status: "use_soon", pressureKind: "use_by", daysLeft: 1 })).toBe(
      "Use by tomorrow",
    );
    expect(urgencyPhrase({ status: "use_soon", pressureKind: "best_before", daysLeft: 5 })).toBe(
      "Best before in 5 days",
    );
    expect(urgencyPhrase({ status: "use_soon", pressureKind: "open_life", daysLeft: 0 })).toBe(
      "Opened — use today",
    );
    expect(
      urgencyPhrase({ status: "quality_declining", pressureKind: "open_life", daysLeft: -9 }),
    ).toBe("Opened a while ago — check it");
  });
});

describe("dashboard svg", () => {
  it("escapes names so a stray & or < can't break the document", () => {
    const svg = buildDashboardSvg({
      ...base,
      urgent: [{ name: 'Bill & Ben"s <chutney>', sub: "Use by today" }],
    });
    expect(svg).toContain("Bill &amp; Ben&quot;s &lt;chutney&gt;");
    expect(svg).not.toMatch(/<chutney>/);
  });

  it("shows a reassuring empty state rather than a blank panel", () => {
    expect(buildDashboardSvg(base)).toContain("Nothing to use up");
  });

  it("never draws more rows than fit the panel", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `Item ${i}`, sub: "Use by today" }));
    const svg = buildDashboardSvg({ ...base, urgent: many });
    expect(svg).toContain("Item 3");
    expect(svg).not.toContain("Item 4");
  });

  it("puts the recipe and the battery in the footer when there are any", () => {
    const svg = buildDashboardSvg({ ...base, recipe: "Tomato pasta", battery: 87, lowStock: 3 });
    expect(svg).toContain("Cook: Tomato pasta");
    expect(svg).toContain("3 low · 87%");
  });
});

describe("png render", () => {
  it("has the bundled fonts (the container has no system fonts)", () => {
    expect(() => assertFontsPresent()).not.toThrow();
  });

  it("renders a valid PNG at exactly the panel size", () => {
    const png = renderPng(
      buildDashboardSvg({
        ...base,
        urgent: [
          { name: "Fresh pesto", sub: "Use by tomorrow" },
          { name: "Mango chutney", sub: "Opened — use in 4 days" },
        ],
        battery: 64,
      }),
    );
    expect(pngSize(png)).toEqual({ w: DISPLAY_W, h: DISPLAY_H });
  });
});
