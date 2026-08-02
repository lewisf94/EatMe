import { describe, it, expect } from "vitest";
import {
  buildMagtagUrgentSvg,
  buildMagtagRecipeSvg,
  buildMagtagShoppingSvg,
  renderMagtagBmp,
  MAGTAG_W,
  MAGTAG_H,
  MAGTAG_ROWS,
  type MagtagUrgentData,
  type MagtagRecipeData,
  type MagtagShoppingData,
} from "../src/services/magtagDisplay.js";

const chrome = { rendered: "Fri 24 Jul, 08:00" };

/** BMP header: "BM" signature, then the BITMAPINFOHEADER carries width/height
 *  (little-endian) and bit depth right after it. */
function bmpInfo(buf: Buffer): { w: number; h: number; bpp: number } {
  expect(buf.subarray(0, 2).toString("ascii")).toBe("BM");
  expect(buf.readUInt32LE(2)).toBe(buf.length); // file-size field matches the actual buffer
  return { w: buf.readInt32LE(18), h: buf.readInt32LE(22), bpp: buf.readUInt16LE(28) };
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

describe("magtag bmp render", () => {
  it("renders a valid 4-bit indexed BMP at exactly the MagTag panel size", () => {
    const bmp = renderMagtagBmp(buildMagtagUrgentSvg({ ...chrome, urgent: [], battery: 64 }));
    expect(bmpInfo(bmp)).toEqual({ w: MAGTAG_W, h: MAGTAG_H, bpp: 4 });
  });

  it("packs two pixels per byte, well under the equivalent PNG's uncompressed size", () => {
    const bmp = renderMagtagBmp(buildMagtagShoppingSvg({ ...chrome, items: [], total: 0 }));
    // header (14) + BITMAPINFOHEADER (40) + 4-entry palette (16) + 296x128 at 2px/byte
    expect(bmp.length).toBe(14 + 40 + 16 + (MAGTAG_W / 2) * MAGTAG_H);
  });

  it("quantizes every pixel to one of exactly four gray levels", () => {
    const bmp = renderMagtagBmp(
      buildMagtagUrgentSvg({
        ...chrome,
        urgent: [{ name: "Something with soft anti-aliased edges", sub: "Use by today" }],
      }),
    );
    const palette = new Set<number>();
    for (let i = 0; i < 4; i++) palette.add(bmp.readUInt8(14 + 40 + i * 4));
    expect(palette.size).toBe(4);
    expect([...palette].sort((a, b) => a - b)).toEqual([0x00, 0x55, 0xaa, 0xff]);
  });
});
