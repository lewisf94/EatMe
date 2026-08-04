// The MagTag render profile: a 2.9" 296x128 four-gray e-paper, much smaller
// than the classic 4.2" panel, so it gets its own compact layouts rather than
// a scaled-down copy of services/display.ts. Kept free of database imports so
// the layout can be unit-tested on its own, same as the classic panel.
import { esc, renderPixels } from "./display.js";

/** Panel size. The MagTag's built-in 2.9" module is fixed at this resolution. */
export const MAGTAG_W = 296;
export const MAGTAG_H = 128;

/** How many urgent rows fit legibly at this size. */
export const MAGTAG_ROWS = 2;
const HEADER_H = 22;
const FOOTER_H = 16;
const ROW_H = (MAGTAG_H - HEADER_H - FOOTER_H) / MAGTAG_ROWS;
const PAD_X = 8;
const CONTENT_W = MAGTAG_W - PAD_X * 2;

/**
 * Archivo glyph advances at 1000 px, ordered from ASCII space (32) through
 * tilde (126). These are generated from the exact bundled regular and bold
 * font files used by Resvg. Character-count clipping was especially wasteful
 * on narrow product names (for example, lots of i/l/t characters), so fitting
 * by the font's actual advances makes the whole 280 px line available without
 * adding a font-parsing dependency to the server.
 *
 * Summing advances is deliberately a tiny bit conservative because kerning
 * can only make common pairs narrower. The SVG body clip is the final guard
 * against an unusual glyph extending beyond the safe display area.
 */
const REGULAR_ADVANCES = [
  209, 273, 374, 582, 510, 950, 692, 209, 355, 355, 407, 625, 277, 333, 277, 294, 573, 521, 567,
  573, 555, 571, 573, 553, 574, 573, 296, 296, 625, 625, 625, 578, 1005, 682, 698, 728, 734, 677,
  612, 796, 736, 267, 559, 662, 536, 847, 736, 788, 665, 788, 727, 673, 606, 731, 648, 924, 680,
  655, 635, 296, 294, 296, 625, 485, 187, 545, 567, 519, 567, 548, 280, 556, 563, 225, 223, 514,
  225, 860, 563, 570, 567, 567, 332, 510, 297, 562, 504, 723, 513, 504, 498, 353, 245, 353, 625,
] as const;
const BOLD_ADVANCES = [
  196, 301, 456, 600, 556, 973, 764, 253, 364, 364, 407, 641, 307, 333, 307, 300, 595, 596, 596,
  596, 597, 595, 596, 596, 596, 595, 335, 335, 641, 641, 641, 613, 1001, 724, 722, 733, 739, 683,
  622, 802, 754, 301, 603, 725, 591, 872, 754, 793, 681, 793, 730, 679, 641, 748, 694, 964, 706,
  699, 653, 350, 300, 350, 641, 518, 228, 580, 608, 573, 608, 584, 325, 607, 602, 267, 264, 570,
  267, 891, 602, 613, 608, 608, 380, 556, 342, 601, 547, 798, 572, 547, 519, 393, 253, 393, 641,
] as const;

type FontWeight = 400 | 700;

function glyphAdvance(char: string, weight: FontWeight): number {
  const code = char.codePointAt(0) ?? 32;
  const table = weight === 700 ? BOLD_ADVANCES : REGULAR_ADVANCES;
  if (code >= 32 && code <= 126) return table[code - 32];
  // Combining accents add no advance. Most Latin glyphs are close to 0.6 em;
  // reserve a full em for CJK and emoji so unknown text is never overdrawn.
  if (code >= 0x300 && code <= 0x36f) return 0;
  if (code >= 0x2e80) return 1000;
  return weight === 700 ? 650 : 600;
}

export function measureMagtagText(
  text: string,
  fontSize: number,
  weight: FontWeight = 400,
): number {
  return (
    (Array.from(text).reduce((total, char) => total + glyphAdvance(char, weight), 0) * fontSize) /
    1000
  );
}

/** Fit one line to a pixel width using the real display font, adding an
 * ellipsis only when the complete value genuinely cannot fit. */
export function fitMagtagText(
  raw: string,
  maxWidth: number,
  fontSize: number,
  weight: FontWeight = 400,
): string {
  const text = raw.replace(/\s+/gu, " ").trim();
  if (measureMagtagText(text, fontSize, weight) <= maxWidth) return text;

  const chars = Array.from(text);
  const ellipsis = "…";
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${chars.slice(0, middle).join("").trimEnd()}${ellipsis}`;
    if (measureMagtagText(candidate, fontSize, weight) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return `${chars.slice(0, low).join("").trimEnd()}${ellipsis}`;
}

/** Word-wrap compact summaries, reserving the final line for a measured
 * ellipsis when more text remains. */
export function wrapMagtagText(
  raw: string,
  maxWidth: number,
  fontSize: number,
  weight: FontWeight,
  maxLines: number,
): string[] {
  const words = raw.replace(/\s+/gu, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cursor = 0;
  while (cursor < words.length && lines.length < maxLines) {
    if (lines.length === maxLines - 1) {
      lines.push(fitMagtagText(words.slice(cursor).join(" "), maxWidth, fontSize, weight));
      break;
    }

    let line = "";
    while (cursor < words.length) {
      const candidate = line ? `${line} ${words[cursor]}` : words[cursor];
      if (line && measureMagtagText(candidate, fontSize, weight) > maxWidth) break;
      line = fitMagtagText(candidate, maxWidth, fontSize, weight);
      cursor += 1;
      if (line.endsWith("…")) break;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Battery is deliberately not on the panel. A rendered image is only redrawn
 *  when its *content* changes — an e-paper refresh is the most expensive thing
 *  this device does — so a percentage baked into the image would sit frozen at
 *  whatever it was when the food list last changed, and could read 87% while
 *  the cell is actually at 20%. The device reports battery on every wake and
 *  the app's Settings > MagTag health shows the current value, fetched when
 *  that screen is opened. */
export type MagtagChrome = { rendered: string };

export type MagtagUrgentData = MagtagChrome & {
  urgent: { name: string; sub: string }[];
  urgentTotal?: number;
};
export type MagtagRecipeData = MagtagChrome & { recipe?: string; matchedItems: string[] };
export type MagtagShoppingData = MagtagChrome & { items: string[]; total: number };
export type MagtagStatusData = MagtagChrome & {
  battery: number | null;
  rssi: number | null;
  lastSync: string | null;
};

function chrome(title: string, context?: string): string[] {
  const parts = [
    `<defs><clipPath id="body-clip"><rect x="${PAD_X}" y="${HEADER_H}" width="${CONTENT_W}" height="${MAGTAG_H - HEADER_H - FOOTER_H}"/></clipPath></defs>`,
    `<rect width="${MAGTAG_W}" height="${MAGTAG_H}" fill="#fff"/>`,
    `<rect width="${MAGTAG_W}" height="${HEADER_H}" fill="#000"/>`,
    `<text x="${PAD_X}" y="15" font-family="Archivo" font-weight="700" font-size="12" fill="#fff">${esc(
      fitMagtagText(title, 150, 12, 700),
    )}</text>`,
  ];
  if (context)
    parts.push(
      `<text x="${MAGTAG_W - PAD_X}" y="15" text-anchor="end" font-family="Archivo" font-weight="700" font-size="10" fill="#fff">${esc(
        fitMagtagText(context, 126, 10, 700),
      )}</text>`,
    );
  return parts;
}

function footer(d: MagtagChrome): string {
  const top = MAGTAG_H - FOOTER_H;
  return [
    `<rect x="0" y="${top}" width="${MAGTAG_W}" height="${FOOTER_H}" fill="#000"/>`,
    `<text x="${PAD_X}" y="${MAGTAG_H - 4}" font-family="Archivo" font-weight="700" font-size="10" fill="#fff">${esc(
      fitMagtagText(`Updated ${d.rendered}`, CONTENT_W, 10, 700),
    )}</text>`,
  ].join("");
}

function wrap(parts: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MAGTAG_W}" height="${MAGTAG_H}" viewBox="0 0 ${MAGTAG_W} ${MAGTAG_H}" text-rendering="optimizeLegibility">${parts.join("")}</svg>`;
}

/** Button 1: the same urgency list as the classic panel, cut down to two rows. */
export function buildMagtagUrgentSvg(d: MagtagUrgentData): string {
  const total = d.urgentTotal ?? d.urgent.length;
  const parts = chrome("EAT ME FIRST", total > 0 ? `${total} due` : undefined);
  if (d.urgent.length === 0) {
    parts.push(
      `<text x="${MAGTAG_W / 2}" y="64" text-anchor="middle" font-family="Archivo" font-weight="700" font-size="16">Nothing to use up</text>`,
      `<text x="${MAGTAG_W / 2}" y="84" text-anchor="middle" font-family="Archivo" font-size="11">Everything is in good shape</text>`,
    );
  } else {
    d.urgent.slice(0, MAGTAG_ROWS).forEach((item, i) => {
      const top = HEADER_H + i * ROW_H;
      if (i > 0)
        parts.push(`<rect x="${PAD_X}" y="${top}" width="${CONTENT_W}" height="1" fill="#aaa"/>`);
      parts.push(
        `<text x="${PAD_X}" y="${top + 17}" clip-path="url(#body-clip)" font-family="Archivo" font-weight="700" font-size="14" fill="#000">${esc(
          fitMagtagText(item.name, CONTENT_W, 14, 700),
        )}</text>`,
        `<text x="${PAD_X}" y="${top + 34}" clip-path="url(#body-clip)" font-family="Archivo" font-size="11" fill="#000">${esc(
          fitMagtagText(item.sub, CONTENT_W, 11),
        )}</text>`,
      );
    });
  }
  parts.push(footer(d));
  return wrap(parts);
}

/** Button 2: the top use-it-up recipe suggestion, if any recipe matches. */
export function buildMagtagRecipeSvg(d: MagtagRecipeData): string {
  const parts = chrome("RECIPE");
  if (!d.recipe) {
    parts.push(
      `<text x="${MAGTAG_W / 2}" y="64" text-anchor="middle" font-family="Archivo" font-weight="700" font-size="16">No suggestion yet</text>`,
      `<text x="${MAGTAG_W / 2}" y="84" text-anchor="middle" font-family="Archivo" font-size="11">Add recipes to find a match</text>`,
    );
  } else {
    const recipeLines = wrapMagtagText(d.recipe, CONTENT_W, 16, 700, 2);
    const uses = d.matchedItems.length
      ? `Uses: ${d.matchedItems.join(", ")}`
      : "Uses what's expiring";
    const useLines = wrapMagtagText(uses, CONTENT_W, 11, 400, 2);
    parts.push(
      ...recipeLines.map(
        (line, i) =>
          `<text x="${PAD_X}" y="${HEADER_H + 20 + i * 18}" clip-path="url(#body-clip)" font-family="Archivo" font-weight="700" font-size="16" fill="#000">${esc(line)}</text>`,
      ),
      `<rect x="${PAD_X}" y="66" width="${CONTENT_W}" height="1" fill="#aaa"/>`,
      `<text x="${PAD_X}" y="79" font-family="Archivo" font-weight="700" font-size="9" fill="#000">USE SOON</text>`,
      ...useLines.map(
        (line, i) =>
          `<text x="${PAD_X}" y="${94 + i * 14}" clip-path="url(#body-clip)" font-family="Archivo" font-size="11" fill="#000">${esc(line)}</text>`,
      ),
    );
  }
  parts.push(footer(d));
  return wrap(parts);
}

/** Button 3: how many things are on the shopping list, and the first few. */
export function buildMagtagShoppingSvg(d: MagtagShoppingData): string {
  const parts = chrome("SHOPPING");
  if (d.total === 0) {
    parts.push(
      `<text x="${MAGTAG_W / 2}" y="64" text-anchor="middle" font-family="Archivo" font-weight="700" font-size="16">List is empty</text>`,
      `<text x="${MAGTAG_W / 2}" y="84" text-anchor="middle" font-family="Archivo" font-size="11">Nothing to pick up</text>`,
    );
  } else {
    const shown = d.items.slice(0, 4);
    const remaining = Math.max(0, d.total - shown.length);
    const preview = `${shown.join(", ")}${remaining ? `; +${remaining} more` : ""}`;
    const previewLines = wrapMagtagText(preview, CONTENT_W, 12, 400, 2);
    parts.push(
      `<text x="${PAD_X}" y="43" font-family="Archivo" font-weight="700" font-size="17" fill="#000">${d.total} item${
        d.total === 1 ? "" : "s"
      } to buy</text>`,
      `<text x="${PAD_X}" y="63" font-family="Archivo" font-weight="700" font-size="9" fill="#000">NEXT</text>`,
      ...previewLines.map(
        (line, i) =>
          `<text x="${PAD_X}" y="${80 + i * 16}" clip-path="url(#body-clip)" font-family="Archivo" font-size="12" fill="#000">${esc(line)}</text>`,
      ),
    );
  }
  parts.push(footer(d));
  return wrap(parts);
}

/** Button 4: device health — battery, Wi-Fi signal and when it last checked
 *  in. Every button press bypasses the ETag cache (see routes/magtag.ts), so
 *  this always shows the value from the wake that requested it, not a frozen
 *  reading from whenever some other page's content last changed. */
export function buildMagtagStatusSvg(d: MagtagStatusData): string {
  const parts = chrome("STATUS");
  const battery = d.battery == null ? "Battery unknown" : `Battery ${Math.round(d.battery)}%`;
  const signal = d.rssi == null ? "Wi-Fi unknown" : `Wi-Fi ${Math.round(d.rssi)} dBm`;
  const lastSync = `Last sync ${d.lastSync ?? "never"}`;
  parts.push(
    `<text x="${PAD_X}" y="43" clip-path="url(#body-clip)" font-family="Archivo" font-weight="700" font-size="17" fill="#000">${esc(
      fitMagtagText(battery, CONTENT_W, 17, 700),
    )}</text>`,
    `<text x="${PAD_X}" y="68" clip-path="url(#body-clip)" font-family="Archivo" font-weight="700" font-size="12" fill="#000">${esc(
      fitMagtagText(signal, CONTENT_W, 12, 700),
    )}</text>`,
    `<rect x="${PAD_X}" y="78" width="${CONTENT_W}" height="1" fill="#aaa"/>`,
    `<text x="${PAD_X}" y="98" clip-path="url(#body-clip)" font-family="Archivo" font-size="11" fill="#000">${esc(
      fitMagtagText(lastSync, CONTENT_W, 11),
    )}</text>`,
  );
  parts.push(footer(d));
  return wrap(parts);
}

/** The panel's native gray depth — matches the "four-level grayscale" render
 *  profile called for by the hardware plan. */
const GRAY_LEVELS = [0x00, 0x55, 0xaa, 0xff] as const;

function nearestGrayIndex(v: number): number {
  let best = 0;
  let bestDiff = Math.abs(v - GRAY_LEVELS[0]);
  for (let i = 1; i < GRAY_LEVELS.length; i++) {
    const diff = Math.abs(v - GRAY_LEVELS[i]);
    if (diff < bestDiff) {
      best = i;
      bestDiff = diff;
    }
  }
  return best;
}

/** Minimal 4-bit indexed BMP encoder (4 of the format's 16 possible palette
 *  slots used, one per gray level). CircuitPython's `adafruit_imageload`
 *  decodes this format from an in-memory HTTP response. Indexed rather
 *  than 24-bit truecolor because it's a twelfth of the size to download on
 *  every wake, which matters far more for battery life than the encoder's
 *  extra few lines. */
function encodeGrayBmp(width: number, height: number, rgba: Buffer): Buffer {
  const rowSize = Math.ceil(width / 2 / 4) * 4; // 2px/byte at 4bpp, rows padded to 4 bytes
  const paletteBytes = GRAY_LEVELS.length * 4; // BGR0 quads
  const dataOffset = 14 + 40 + paletteBytes;
  const pixelDataSize = rowSize * height;
  const buf = Buffer.alloc(dataOffset + pixelDataSize);

  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(buf.length, 2); // file size
  buf.writeUInt32LE(0, 6); // reserved
  buf.writeUInt32LE(dataOffset, 10);

  buf.writeUInt32LE(40, 14); // BITMAPINFOHEADER size
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22); // positive height = bottom-up row order
  buf.writeUInt16LE(1, 26); // colour planes
  buf.writeUInt16LE(4, 28); // bits per pixel
  buf.writeUInt32LE(0, 30); // BI_RGB — no compression
  buf.writeUInt32LE(pixelDataSize, 34);
  buf.writeInt32LE(2835, 38); // ~72 DPI, cosmetic only
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(GRAY_LEVELS.length, 46); // colours used
  buf.writeUInt32LE(GRAY_LEVELS.length, 50); // colours "important"

  GRAY_LEVELS.forEach((gray, i) => {
    const o = 14 + 40 + i * 4;
    buf[o] = gray; // B
    buf[o + 1] = gray; // G
    buf[o + 2] = gray; // R
    buf[o + 3] = 0; // reserved
  });

  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y; // BMP rows are bottom-up
    const rowStart = dataOffset + y * rowSize;
    for (let x = 0; x < width; x += 2) {
      // Every source channel is equal — the SVG palette above is grayscale
      // only — so reading the red channel alone is enough.
      const hi = nearestGrayIndex(rgba[(srcY * width + x) * 4]);
      const lo = x + 1 < width ? nearestGrayIndex(rgba[(srcY * width + x + 1) * 4]) : 0;
      buf[rowStart + x / 2] = (hi << 4) | lo;
    }
  }
  return buf;
}

/** Same bundled-font pipeline as the classic panel, fitted to the MagTag width. */
export function renderMagtagBmp(svg: string): Buffer {
  const { width, height, data } = renderPixels(svg, MAGTAG_W);
  return encodeGrayBmp(width, height, data);
}
