// The kitchen e-ink dashboard. The server renders the whole image; the device is
// dumb — it wakes, downloads this PNG, draws it, and goes back to sleep.
//
// Everything here is tuned for a 4.2" 400x300 black-and-white panel viewed from
// across a kitchen: big type, few lines, no thin strokes or half-tones (the panel
// has no real greys to render them with). Kept free of database imports so the
// layout can be unit-tested on its own.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import type { InventoryRow } from "@eatme/shared";

/** Panel size. Swapping board/panel is a change to these two numbers. */
export const DISPLAY_W = 400;
export const DISPLAY_H = 300;

/** How many items fit legibly at this size. */
export const DISPLAY_ROWS = 4;
const HEADER_H = 38;
const FOOTER_H = 28;
const ROW_H = (DISPLAY_H - HEADER_H - FOOTER_H) / DISPLAY_ROWS;

const assetsDir =
  process.env.ASSETS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets");

export type DashboardData = {
  urgent: { name: string; sub: string }[];
  recipe?: string;
  lowStock: number;
  battery?: number;
  rendered: string;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Archivo is fairly narrow; these caps keep a line inside the panel width. */
function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

/** A short, plain-English reason this item is on the list. Safety and quality
 *  read differently here too — the panel has no colour to lean on. */
export function urgencyPhrase(row: Pick<InventoryRow, "status" | "pressureKind" | "daysLeft">) {
  const d = row.daysLeft;
  const ago = d != null && d < 0 ? -d : null;
  if (row.status === "past_use_by") return ago ? `USE BY passed ${ago}d ago` : "USE BY passed";
  if (row.status === "past_best") return ago ? `Past its best by ${ago}d` : "Past its best";
  if (row.status === "quality_declining") return "Opened a while ago — check it";
  const when = d == null ? "" : d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
  if (row.pressureKind === "use_by") return `Use by ${when}`;
  if (row.pressureKind === "open_life") return `Opened — use ${when}`;
  return `Best before ${when}`;
}

export function buildDashboardSvg(d: DashboardData): string {
  const parts: string[] = [];
  parts.push(
    `<rect width="${DISPLAY_W}" height="${DISPLAY_H}" fill="#fff"/>`,
    `<rect width="${DISPLAY_W}" height="${HEADER_H}" fill="#000"/>`,
    `<text x="16" y="26" font-family="Archivo" font-weight="700" font-size="20" fill="#fff">EAT ME FIRST</text>`,
    `<text x="${DISPLAY_W - 16}" y="25" text-anchor="end" font-family="Archivo" font-size="13" fill="#fff">${esc(d.rendered)}</text>`,
  );

  if (d.urgent.length === 0) {
    parts.push(
      `<text x="${DISPLAY_W / 2}" y="150" text-anchor="middle" font-family="Archivo" font-weight="700" font-size="26">Nothing to use up</text>`,
      `<text x="${DISPLAY_W / 2}" y="180" text-anchor="middle" font-family="Archivo" font-size="15">Your food is in good shape.</text>`,
    );
  } else {
    d.urgent.slice(0, DISPLAY_ROWS).forEach((item, i) => {
      const top = HEADER_H + i * ROW_H;
      if (i > 0)
        parts.push(`<rect x="16" y="${top}" width="${DISPLAY_W - 32}" height="1" fill="#000"/>`);
      parts.push(
        `<text x="16" y="${top + 27}" font-family="Archivo" font-weight="700" font-size="22">${esc(clip(item.name, 28))}</text>`,
        `<text x="16" y="${top + 47}" font-family="Archivo" font-size="14">${esc(clip(item.sub, 44))}</text>`,
      );
    });
  }

  const footY = DISPLAY_H - FOOTER_H;
  const right = [
    d.lowStock > 0 ? `${d.lowStock} low` : "",
    d.battery != null ? `${d.battery}%` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  parts.push(
    `<rect x="0" y="${footY}" width="${DISPLAY_W}" height="${FOOTER_H}" fill="#000"/>`,
    `<text x="16" y="${footY + 19}" font-family="Archivo" font-size="14" fill="#fff">${esc(
      clip(d.recipe ? `Cook: ${d.recipe}` : "EatMe", 34),
    )}</text>`,
  );
  if (right)
    parts.push(
      `<text x="${DISPLAY_W - 16}" y="${footY + 19}" text-anchor="end" font-family="Archivo" font-size="14" fill="#fff">${esc(right)}</text>`,
    );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${DISPLAY_W}" height="${DISPLAY_H}" viewBox="0 0 ${DISPLAY_W} ${DISPLAY_H}">${parts.join("")}</svg>`;
}

/** Render with the bundled font only — the add-on container has no system fonts,
 *  so loading them would make output differ between dev and the Pi. */
export function renderPng(svg: string): Buffer {
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: DISPLAY_W },
    font: {
      loadSystemFonts: false,
      fontFiles: [join(assetsDir, "archivo-regular.ttf"), join(assetsDir, "archivo-bold.ttf")],
      defaultFontFamily: "Archivo",
    },
  });
  return Buffer.from(r.render().asPng());
}

/** Fail fast if the bundled fonts didn't make it into the image. */
export function assertFontsPresent(): void {
  for (const f of ["archivo-regular.ttf", "archivo-bold.ttf"]) readFileSync(join(assetsDir, f));
}
