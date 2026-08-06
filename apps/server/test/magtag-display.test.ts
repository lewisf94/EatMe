import { describe, it, expect } from "vitest";
import {
  buildMagtagUrgentSvg,
  buildMagtagRecipeSvg,
  buildMagtagShoppingSvg,
  buildMagtagStatusSvg,
  renderMagtagBmp,
  MAGTAG_W,
  MAGTAG_H,
  MAGTAG_ROWS,
  fitMagtagText,
  measureMagtagText,
  wrapMagtagText,
  type MagtagUrgentData,
  type MagtagRecipeData,
  type MagtagShoppingData,
  type MagtagStatusData,
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

  it("keeps battery off the panel, since a cached image would freeze the value", () => {
    // The panel is only redrawn when its content changes, so a percentage baked
    // into the image would show whatever it was when the food list last moved.
    // Settings > MagTag health owns the live figure instead.
    const svg = buildMagtagUrgentSvg({ ...chrome, urgent: [] });
    expect(svg).not.toMatch(/\d+%/);
  });

  it("uses the available pixel width instead of clipping names by character count", () => {
    const name = "Reduced T W Some Price Rolls";
    const svg = buildMagtagUrgentSvg({
      ...chrome,
      urgent: [{ name, sub: "Use by today" }],
    });
    expect(svg).toContain(name);
    expect(svg).not.toContain("Reduced T W Some Price Ro…");
  });

  it("keeps secondary body text black, bold and large for e-paper contrast", () => {
    const svg = buildMagtagUrgentSvg({
      ...chrome,
      urgent: [{ name: "Milk", sub: "Use by today" }],
    });
    expect(svg).toContain('font-weight="700" font-size="14" fill="#000">Use by today</text>');
    expect(svg).not.toContain('fill="#555"');
  });

  it("shows the total urgent count without reducing the item line width", () => {
    const svg = buildMagtagUrgentSvg({
      ...chrome,
      urgentTotal: 5,
      urgent: [{ name: "Milk", sub: "Use by today" }],
    });
    expect(svg).toContain("5 due");
    expect(svg).not.toMatch(/\d+%/);
  });
});

describe("magtag width-aware text", () => {
  it("keeps narrow text that fits and ellipsizes genuinely wide text", () => {
    const narrow = "iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii";
    const wide = "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW";
    expect(fitMagtagText(narrow, 280, 14, 700)).toBe(narrow);
    const fittedWide = fitMagtagText(wide, 280, 14, 700);
    expect(fittedWide).toMatch(/…$/);
    expect(measureMagtagText(fittedWide, 14, 700)).toBeLessThanOrEqual(280);
  });

  it("wraps summaries onto the available lines before truncating", () => {
    expect(wrapMagtagText("Milk Eggs Bread Butter", 80, 12, 400, 2)).toHaveLength(2);
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
    expect(svg).toContain("Milk, Eggs, Bread, Butter");
  });

  it("reports how many shopping items remain beyond the four-item preview", () => {
    const svg = buildMagtagShoppingSvg({
      ...chrome,
      items: ["Milk", "Eggs", "Bread", "Butter", "Apples", "Tea"],
      total: 6,
    });
    expect(svg).toContain("+2 more");
  });
});

describe("magtag status page", () => {
  it("shows unknown for battery and signal before any device has checked in", () => {
    const data: MagtagStatusData = { ...chrome, battery: null, rssi: null, lastSync: null };
    const svg = buildMagtagStatusSvg(data);
    expect(svg).toContain("Battery unknown");
    expect(svg).toContain("Wi-Fi unknown");
    expect(svg).toContain("Last sync never");
  });

  it("shows the last reported battery, signal and check-in time", () => {
    const svg = buildMagtagStatusSvg({
      ...chrome,
      battery: 42,
      rssi: -61,
      lastSync: "Fri 24 Jul, 07:55",
    });
    expect(svg).toContain("Battery 42%");
    expect(svg).toContain("Wi-Fi -61 dBm");
    expect(svg).toContain("Last sync Fri 24 Jul, 07:55");
    expect(svg).not.toContain('fill="#555"');
  });
});

describe("magtag bmp render", () => {
  it("renders a valid 4-bit indexed BMP at exactly the MagTag panel size", () => {
    const bmp = renderMagtagBmp(buildMagtagUrgentSvg({ ...chrome, urgent: [] }));
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

  it("uses only the strongest black and white palette entries for legibility", () => {
    const bmp = renderMagtagBmp(
      buildMagtagUrgentSvg({
        ...chrome,
        urgent: [{ name: "Reduced T W Some Price Rolls", sub: "Use by today" }],
      }),
    );
    const dataOffset = bmp.readUInt32LE(10);
    const used = new Set<number>();
    for (const packed of bmp.subarray(dataOffset)) {
      used.add(packed >> 4);
      used.add(packed & 0x0f);
    }
    expect([...used].sort()).toEqual([0, 3]);
  });
});
