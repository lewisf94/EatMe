import { describe, it, expect } from "vitest";
import {
  buildMagtagUrgentSvg,
  buildMagtagRecipeSvg,
  buildMagtagShoppingSvg,
  renderMagtagPng,
  MAGTAG_W,
  MAGTAG_H,
  MAGTAG_ROWS,
  type MagtagUrgentData,
  type MagtagRecipeData,
  type MagtagShoppingData,
} from "../src/services/magtagDisplay.js";

const chrome = { rendered: "Fri 24 Jul, 08:00" };

/** PNG header: 8-byte signature, then IHDR carries width/height as big-endian. */
function pngSize(buf: Buffer): { w: number; h: number } {
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(buf.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe("magtag urgent page", () => {
  it("escapes names so a stray & or < can't break the document", () => {
    const svg = buildMagtagUrgentSvg({
      ...chrome,
      urgent: [{ name: 'Bill & Ben"s <chutney>', sub: "Use by today" }],
    } satisfies MagtagUrgentData);
    expect(svg).toContain("Bill &amp; Ben&quot;s &lt;chutney&gt;");
    expect(svg).not.toMatch(/<chutney>/);
  });

  it("shows a reassuring empty state rather than a blank panel", () => {
    expect(buildMagtagUrgentSvg({ ...chrome, urgent: [] })).toContain("Nothing to use up");
  });

  it("never draws more rows than fit the small panel", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ name: `Item ${i}`, sub: "Use by today" }));
    const svg = buildMagtagUrgentSvg({ ...chrome, urgent: many });
    expect(svg).toContain(`Item ${MAGTAG_ROWS - 1}`);
    expect(svg).not.toContain(`Item ${MAGTAG_ROWS}`);
  });

  it("shows the battery percentage when reported", () => {
    expect(buildMagtagUrgentSvg({ ...chrome, urgent: [], battery: 42 })).toContain("42%");
  });
});

describe("magtag recipe page", () => {
  it("shows a fallback when nothing matches", () => {
    const data: MagtagRecipeData = { ...chrome, matchedItems: [] };
    expect(buildMagtagRecipeSvg(data)).toContain("No suggestion");
  });

  it("names the recipe and what it uses up", () => {
    const svg = buildMagtagRecipeSvg({
      ...chrome,
      recipe: "Tomato pasta",
      matchedItems: ["Tomatoes", "Basil"],
    });
    expect(svg).toContain("Tomato pasta");
    expect(svg).toContain("Tomatoes, Basil");
  });
});

describe("magtag shopping page", () => {
  it("shows a fallback when the list is empty", () => {
    const data: MagtagShoppingData = { ...chrome, items: [], total: 0 };
    expect(buildMagtagShoppingSvg(data)).toContain("List is empty");
  });

  it("counts items and previews the first few", () => {
    const svg = buildMagtagShoppingSvg({
      ...chrome,
      items: ["Milk", "Eggs", "Bread", "Butter"],
      total: 4,
    });
    expect(svg).toContain("4 items to buy");
    expect(svg).toContain("Milk, Eggs, Bread");
    expect(svg).not.toContain("Butter");
  });
});

describe("magtag png render", () => {
  it("renders a valid PNG at exactly the MagTag panel size", () => {
    const png = renderMagtagPng(buildMagtagUrgentSvg({ ...chrome, urgent: [], battery: 64 }));
    expect(pngSize(png)).toEqual({ w: MAGTAG_W, h: MAGTAG_H });
  });
});
