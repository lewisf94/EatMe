// The MagTag render profile: a 2.9" 296x128 four-gray e-paper, much smaller
// than the classic 4.2" panel, so it gets its own compact layouts rather than
// a scaled-down copy of services/display.ts. Kept free of database imports so
// the layout can be unit-tested on its own, same as the classic panel.
import { esc, clip, renderPng } from "./display.js";

/** Panel size. The MagTag's built-in 2.9" module is fixed at this resolution. */
export const MAGTAG_W = 296;
export const MAGTAG_H = 128;

/** How many urgent rows fit legibly at this size. */
export const MAGTAG_ROWS = 2;
const HEADER_H = 20;
const FOOTER_H = 14;
const ROW_H = (MAGTAG_H - HEADER_H - FOOTER_H) / MAGTAG_ROWS;

export type MagtagChrome = { battery?: number; rendered: string };

export type MagtagUrgentData = MagtagChrome & { urgent: { name: string; sub: string }[] };
export type MagtagRecipeData = MagtagChrome & { recipe?: string; matchedItems: string[] };
export type MagtagShoppingData = MagtagChrome & { items: string[]; total: number };

function chrome(title: string, d: MagtagChrome): string[] {
  const parts = [
    `<rect width="${MAGTAG_W}" height="${MAGTAG_H}" fill="#fff"/>`,
    `<rect width="${MAGTAG_W}" height="${HEADER_H}" fill="#000"/>`,
    `<text x="8" y="14" font-family="Archivo" font-weight="700" font-size="12" fill="#fff">${esc(title)}</text>`,
  ];
  if (d.battery != null)
    parts.push(
      `<text x="${MAGTAG_W - 8}" y="14" text-anchor="end" font-family="Archivo" font-size="10" fill="#fff">${d.battery}%</text>`,
    );
  return parts;
}

function footer(d: MagtagChrome): string {
  return `<text x="8" y="${MAGTAG_H - 4}" font-family="Archivo" font-size="9" fill="#555">${esc(d.rendered)}</text>`;
}

function wrap(parts: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MAGTAG_W}" height="${MAGTAG_H}" viewBox="0 0 ${MAGTAG_W} ${MAGTAG_H}">${parts.join("")}</svg>`;
}

/** Button 1: the same urgency list as the classic panel, cut down to two rows. */
export function buildMagtagUrgentSvg(d: MagtagUrgentData): string {
  const parts = chrome("EAT ME FIRST", d);
  if (d.urgent.length === 0) {
    parts.push(
      `<text x="${MAGTAG_W / 2}" y="72" text-anchor="middle" font-family="Archivo" font-weight="700" font-size="14">Nothing to use up</text>`,
    );
  } else {
    d.urgent.slice(0, MAGTAG_ROWS).forEach((item, i) => {
      const top = HEADER_H + i * ROW_H;
      parts.push(
        `<text x="8" y="${top + 18}" font-family="Archivo" font-weight="700" font-size="13">${esc(clip(item.name, 26))}</text>`,
        `<text x="8" y="${top + 33}" font-family="Archivo" font-size="10" fill="#555">${esc(clip(item.sub, 36))}</text>`,
      );
    });
  }
  parts.push(footer(d));
  return wrap(parts);
}

/** Button 2: the top use-it-up recipe suggestion, if any recipe matches. */
export function buildMagtagRecipeSvg(d: MagtagRecipeData): string {
  const parts = chrome("RECIPE", d);
  if (!d.recipe) {
    parts.push(
      `<text x="${MAGTAG_W / 2}" y="72" text-anchor="middle" font-family="Archivo" font-weight="700" font-size="14">No suggestion</text>`,
    );
  } else {
    parts.push(
      `<text x="8" y="${HEADER_H + 24}" font-family="Archivo" font-weight="700" font-size="16">${esc(clip(d.recipe, 22))}</text>`,
      `<text x="8" y="${HEADER_H + 44}" font-family="Archivo" font-size="10" fill="#555">${esc(
        clip(
          d.matchedItems.length ? `Uses: ${d.matchedItems.join(", ")}` : "Uses what's expiring",
          40,
        ),
      )}</text>`,
    );
  }
  parts.push(footer(d));
  return wrap(parts);
}

/** Button 3: how many things are on the shopping list, and the first few. */
export function buildMagtagShoppingSvg(d: MagtagShoppingData): string {
  const parts = chrome("SHOPPING", d);
  if (d.total === 0) {
    parts.push(
      `<text x="${MAGTAG_W / 2}" y="72" text-anchor="middle" font-family="Archivo" font-weight="700" font-size="14">List is empty</text>`,
    );
  } else {
    parts.push(
      `<text x="8" y="${HEADER_H + 24}" font-family="Archivo" font-weight="700" font-size="16">${d.total} item${
        d.total === 1 ? "" : "s"
      } to buy</text>`,
      `<text x="8" y="${HEADER_H + 44}" font-family="Archivo" font-size="10" fill="#555">${esc(
        clip(d.items.slice(0, 3).join(", "), 40),
      )}</text>`,
    );
  }
  parts.push(footer(d));
  return wrap(parts);
}

/** Same bundled-font pipeline as the classic panel, fitted to the MagTag width. */
export function renderMagtagPng(svg: string): Buffer {
  return renderPng(svg, MAGTAG_W);
}
