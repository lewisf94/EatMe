// The MagTag render profile: a 2.9" 296x128 four-gray e-paper, much smaller
// than the classic 4.2" panel, so it gets its own compact layouts rather than
// a scaled-down copy of services/display.ts. Kept free of database imports so
// the layout can be unit-tested on its own, same as the classic panel.
import { esc, renderPixels } from "./display.js";

/** Panel size. The MagTag's built-in 2.9" module is fixed at this resolution. */
export const MAGTAG_W = 296;
export const MAGTAG_H = 128;

/** How many urgent rows fit legibly at this size. Up to two use large text;
 *  a third row uses a smaller size that is still easy to read. */
export const MAGTAG_ROWS = 3;
// On the physical panel, text below about 15 px looked broken, most of all
// white text in the black bars, so every size here is 15 px or larger.
const HEADER_H = 24;
const FOOTER_H = 19;
const BODY_TOP = HEADER_H;
const BODY_H = MAGTAG_H - HEADER_H - FOOTER_H;
const BAR_TEXT = 16;
const FOOTER_TEXT = 15;
const PAD_X = 8;
const CONTENT_W = MAGTAG_W - PAD_X * 2;
const GAP = 10;
const MIN_NAME_TEXT = 16;

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
  /** Position of the first shown item in the full urgent list (0-based). */
  start?: number;
};
export type MagtagRecipeData = MagtagChrome & { recipe?: string; matchedItems: string[] };
export type MagtagShoppingData = MagtagChrome & { items: string[]; total: number };
export type MagtagStatusData = MagtagChrome & {
  battery: number | null;
  rssi: number | null;
  lastSync: string | null;
};

function text(
  x: number,
  y: number,
  size: number,
  value: string,
  opts: { fill?: string; anchor?: "start" | "middle" | "end"; clip?: boolean } = {},
): string {
  const anchor = opts.anchor && opts.anchor !== "start" ? ` text-anchor="${opts.anchor}"` : "";
  const clip = opts.clip ? ` clip-path="url(#body-clip)"` : "";
  return `<text x="${x}" y="${y}"${anchor}${clip} font-family="Archivo" font-weight="700" font-size="${size}" fill="${opts.fill ?? "#000"}">${esc(value)}</text>`;
}

function rule(y: number): string {
  return `<rect x="${PAD_X}" y="${Math.round(y)}" width="${CONTENT_W}" height="1" fill="#000"/>`;
}

/** Baseline that centres a line of bold Archivo capitals in a band. */
function baseline(top: number, height: number, size: number): number {
  return Math.round(top + height / 2 + size * 0.36);
}

function chrome(title: string, context?: string): string[] {
  const y = baseline(0, HEADER_H, BAR_TEXT);
  const contextW = context ? measureMagtagText(context, BAR_TEXT, 700) : 0;
  const parts = [
    `<defs><clipPath id="body-clip"><rect x="${PAD_X}" y="${BODY_TOP}" width="${CONTENT_W}" height="${BODY_H}"/></clipPath></defs>`,
    `<rect width="${MAGTAG_W}" height="${MAGTAG_H}" fill="#fff"/>`,
    `<rect width="${MAGTAG_W}" height="${HEADER_H}" fill="#000"/>`,
    text(PAD_X, y, BAR_TEXT, fitMagtagText(title, CONTENT_W - contextW - GAP, BAR_TEXT, 700), {
      fill: "#fff",
    }),
  ];
  if (context)
    parts.push(text(MAGTAG_W - PAD_X, y, BAR_TEXT, context, { fill: "#fff", anchor: "end" }));
  return parts;
}

/** "Updated" plus the time only: the date made the line too long for a size
 *  that stays readable, and the panel is refreshed at least twice a day. */
function footer(d: MagtagChrome, right?: string): string {
  const top = MAGTAG_H - FOOTER_H;
  const y = baseline(top, FOOTER_H, FOOTER_TEXT);
  const time = d.rendered.split(/,\s*/).pop() ?? d.rendered;
  const rightW = right ? measureMagtagText(right, FOOTER_TEXT, 700) : 0;
  return [
    `<rect x="0" y="${top}" width="${MAGTAG_W}" height="${FOOTER_H}" fill="#000"/>`,
    text(
      PAD_X,
      y,
      FOOTER_TEXT,
      fitMagtagText(`Updated ${time}`, CONTENT_W - rightW - GAP, FOOTER_TEXT, 700),
      { fill: "#fff" },
    ),
    right ? text(MAGTAG_W - PAD_X, y, FOOTER_TEXT, right, { fill: "#fff", anchor: "end" }) : "",
  ].join("");
}

// Anti-aliased glyphs are converted to black and white below; see
// highContrastGrayIndex for the cutoff that keeps their edges clean.
function wrap(parts: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MAGTAG_W}" height="${MAGTAG_H}" viewBox="0 0 ${MAGTAG_W} ${MAGTAG_H}" text-rendering="optimizeLegibility">${parts.join("")}</svg>`;
}

function emptyState(title: string, detail: string): string[] {
  return [
    text(MAGTAG_W / 2, BODY_TOP + 38, 20, title, { anchor: "middle" }),
    text(MAGTAG_W / 2, BODY_TOP + 64, 15, detail, { anchor: "middle" }),
  ];
}

/** Button 1: the most urgent items, each with a short "when" on the right. */
export function buildMagtagUrgentSvg(d: MagtagUrgentData): string {
  const total = d.urgentTotal ?? d.urgent.length;
  const parts = chrome("EAT ME FIRST", total > 0 ? `${total} due` : undefined);
  const shown = d.urgent.slice(0, MAGTAG_ROWS);
  if (shown.length === 0) {
    parts.push(...emptyState("Nothing to use up", "Everything is in good shape"));
  } else {
    const rowH = BODY_H / Math.max(2, shown.length);
    const nameSize = shown.length > 2 ? 19 : 22;
    const whenSize = shown.length > 2 ? 16 : 18;
    shown.forEach((item, i) => {
      const top = BODY_TOP + i * rowH;
      const y = baseline(top, rowH, nameSize);
      const whenW = measureMagtagText(item.sub, whenSize, 700);
      const nameW = CONTENT_W - whenW - GAP;
      // A long name steps down in size before it is cut short, but never below
      // the smallest size that stays readable on the panel.
      let size = nameSize;
      while (size > MIN_NAME_TEXT && measureMagtagText(item.name, size, 700) > nameW) size--;
      if (i > 0) parts.push(rule(top));
      parts.push(
        text(PAD_X, y, size, fitMagtagText(item.name, nameW, size, 700), { clip: true }),
        text(MAGTAG_W - PAD_X, y, whenSize, item.sub, { anchor: "end", clip: true }),
      );
    });
  }
  // When not every item fits, say which ones these are; pressing A again
  // shows the next ones.
  const first = (d.start ?? 0) + 1;
  const last = first + shown.length - 1;
  const range = first === last ? `${first} of ${total}` : `${first}-${last} of ${total}`;
  parts.push(footer(d, total > shown.length ? range : undefined));
  return wrap(parts);
}

/** Button 2: the top use-it-up recipe suggestion, if any recipe matches. */
export function buildMagtagRecipeSvg(d: MagtagRecipeData): string {
  const parts = chrome("RECIPE");
  if (!d.recipe) {
    parts.push(...emptyState("No suggestion yet", "Add recipes to find a match"));
  } else {
    const recipeLines = wrapMagtagText(d.recipe, CONTENT_W, 20, 700, 2);
    const uses = d.matchedItems.length
      ? `Uses: ${d.matchedItems.join(", ")}`
      : "Uses what's expiring";
    const useLines = wrapMagtagText(uses, CONTENT_W, 15, 700, recipeLines.length > 1 ? 1 : 2);
    let y = BODY_TOP + 23;
    for (const line of recipeLines) {
      parts.push(text(PAD_X, y, 20, line, { clip: true }));
      y += 22;
    }
    parts.push(rule(y - 13));
    y += 8;
    for (const line of useLines) {
      parts.push(text(PAD_X, y, 15, line, { clip: true }));
      y += 19;
    }
  }
  parts.push(footer(d));
  return wrap(parts);
}

/** Button 3: how many things are on the shopping list, and the first few. */
export function buildMagtagShoppingSvg(d: MagtagShoppingData): string {
  const parts = chrome("SHOPPING");
  if (d.total === 0) {
    parts.push(...emptyState("List is empty", "Nothing to pick up"));
  } else {
    const shown = d.items.slice(0, 4);
    const remaining = Math.max(0, d.total - shown.length);
    const preview = `${shown.join(", ")}${remaining ? `; +${remaining} more` : ""}`;
    const previewLines = wrapMagtagText(preview, CONTENT_W, 16, 700, 2);
    parts.push(
      text(PAD_X, BODY_TOP + 25, 22, `${d.total} item${d.total === 1 ? "" : "s"} to buy`),
      rule(BODY_TOP + 34),
      ...previewLines.map((line, i) =>
        text(PAD_X, BODY_TOP + 55 + i * 20, 16, line, { clip: true }),
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
    text(PAD_X, BODY_TOP + 25, 22, fitMagtagText(battery, CONTENT_W, 22, 700), { clip: true }),
    text(PAD_X, BODY_TOP + 50, 17, fitMagtagText(signal, CONTENT_W, 17, 700), { clip: true }),
    rule(BODY_TOP + 58),
    text(PAD_X, BODY_TOP + 78, 15, fitMagtagText(lastSync, CONTENT_W, 15, 700), { clip: true }),
  );
  parts.push(footer(d));
  return wrap(parts);
}

/** The panel's native gray depth — matches the "four-level grayscale" render
 *  profile called for by the hardware plan. */
const GRAY_LEVELS = [0x00, 0x55, 0xaa, 0xff] as const;

/** Keep the four-entry indexed palette required by the panel decoder, but use
 * only its strongest black and white endpoints for this text-first UI. Small
 * anti-aliased glyph edges rendered as intermediate gray were visibly faint
 * on the physical 2.9-inch panel. A cutoff above mid-gray slightly strengthens
 * the edge pixels instead of letting them disappear into the white background.
 * It stays below about 190, though: the faint overshoot under the baseline of
 * round letters (c, e, o, s) renders at about 190-225, and a higher cutoff
 * turned it into a stray black dot under each of those letters. */
function highContrastGrayIndex(v: number): number {
  return v < 160 ? 0 : GRAY_LEVELS.length - 1;
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
      const hi = highContrastGrayIndex(rgba[(srcY * width + x) * 4]);
      const lo = x + 1 < width ? highContrastGrayIndex(rgba[(srcY * width + x + 1) * 4]) : 0;
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
