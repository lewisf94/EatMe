/**
 * Run real receipt photos through the same pipeline as a scan: the EatMe OCR
 * app's recognition (addon/ocr/server.py, needs Tesseract) and then the
 * server's parser. Compare the result with an expected item list.
 *
 *   pnpm --filter @eatme/server receipt:check [folder-or-photo ...]
 *
 * Each photo `name.jpg` (or .jpeg/.png) needs `name.expected.json` beside it:
 *   { "merchant": "Aldi", "total": 41.89,
 *     "lines": [{ "name": "nut bars", "quantity": 2, "lineTotal": 3.98 }] }
 *
 * The default folder is `test-receipts/` at the repository root. It is in
 * .gitignore, because receipt photos are personal.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { OcrResult } from "@eatme/shared";
import { parseReceipt, type ParsedLine } from "../src/services/receipt/parse.js";

type ExpectedLine = { name: string; quantity: number; lineTotal: number };
type Expected = { merchant?: string; total?: number; lines: ExpectedLine[] };

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ocrDir = join(repoRoot, "addon/ocr");
const PHOTO = /\.(jpe?g|png)$/i;
// Two names match when most of their letter pairs are the same. OCR often
// changes one letter ("NUTS MINED"); a score of 0.75 still accepts that.
const NAME_MATCH = 0.75;

function recognise(photo: string): OcrResult {
  const script = [
    "import json, sys",
    "sys.path.insert(0, sys.argv[1])",
    "import server",
    "lines, diagnostics = server.extract_lines(open(sys.argv[2], 'rb').read())",
    "print(json.dumps({'lines': lines, 'diagnostics': diagnostics}))",
  ].join("\n");
  const out = execFileSync("python3", ["-c", script, ocrDir, photo], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 16 * 1024 * 1024,
  });
  // server.py also prints a progress line; the result is the last line.
  return JSON.parse(out.trim().split("\n").at(-1) ?? "{}") as OcrResult;
}

function pairs(s: string): string[] {
  const t = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2));
}

/** Dice similarity of letter pairs, 0 to 1. */
function similarity(a: string, b: string): number {
  const pa = pairs(a);
  const pb = pairs(b);
  if (pa.length === 0 || pb.length === 0) return a === b ? 1 : 0;
  const rest = [...pb];
  let shared = 0;
  for (const p of pa) {
    const i = rest.indexOf(p);
    if (i >= 0) {
      shared++;
      rest.splice(i, 1);
    }
  }
  return (2 * shared) / (pa.length + pb.length);
}

type Row = { expected: ExpectedLine; got: ParsedLine | null; score: number; status: string };

function compare(expected: Expected, parsed: ParsedLine[]): { rows: Row[]; extra: ParsedLine[] } {
  const free = new Set(parsed.map((_, i) => i));
  const rows: Row[] = expected.lines.map((e) => {
    // Prefer a line with the same price; fall back to the closest name.
    let best = -1;
    let bestScore = 0;
    for (const i of free) {
      const p = parsed[i];
      const score = similarity(e.name, p.normalizedText) + (p.lineTotal === e.lineTotal ? 0.5 : 0);
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    if (best < 0 || bestScore < 0.5) return { expected: e, got: null, score: 0, status: "MISSING" };
    free.delete(best);
    const got = parsed[best];
    const score = similarity(e.name, got.normalizedText);
    const problems: string[] = [];
    if (score < NAME_MATCH) problems.push("name");
    if (got.quantity !== e.quantity) problems.push("quantity");
    if (got.lineTotal !== e.lineTotal) problems.push("price");
    return { expected: e, got, score, status: problems.length ? problems.join("+") : "ok" };
  });
  return { rows, extra: [...free].map((i) => parsed[i]) };
}

function cases(args: string[]): string[] {
  const targets = args.length ? args : [join(repoRoot, "test-receipts")];
  return targets.flatMap((t) => {
    const p = resolve(t);
    if (!existsSync(p)) {
      console.error(`Not found: ${p}`);
      return [];
    }
    if (statSync(p).isFile()) return [p];
    return readdirSync(p)
      .filter((f) => PHOTO.test(f))
      .sort()
      .map((f) => join(p, f));
  });
}

let failed = 0;
const photos = cases(process.argv.slice(2));
if (photos.length === 0) {
  console.error("No receipt photos found.");
  process.exit(2);
}
for (const photo of photos) {
  const expectedPath = join(dirname(photo), `${basename(photo, extname(photo))}.expected.json`);
  if (!existsSync(expectedPath)) {
    console.error(`Skipped ${basename(photo)}: no ${basename(expectedPath)}`);
    continue;
  }
  const expected = JSON.parse(readFileSync(expectedPath, "utf8")) as Expected;
  const ocr = recognise(photo);
  const parsed = parseReceipt(ocr);
  const { rows, extra } = compare(expected, parsed.lines);

  console.log(`\n${basename(photo)}  (${ocr.lines.length} OCR lines, merchant ${parsed.merchant})`);
  for (const r of rows) {
    const got = r.got
      ? `${r.got.normalizedText} x${r.got.quantity} ${r.got.lineTotal?.toFixed(2)}`
      : "-";
    const mark = r.status === "ok" ? "ok  " : "FAIL";
    console.log(
      `  ${mark} ${r.expected.name.padEnd(20)} x${r.expected.quantity} ${r.expected.lineTotal.toFixed(2)}  | ${got}${r.status === "ok" ? "" : `  [${r.status}]`}`,
    );
  }
  for (const e of extra) console.log(`  FAIL extra line: "${e.rawText}"`);

  const okCount = rows.filter((r) => r.status === "ok").length;
  const items = parsed.lines.reduce((n, l) => n + l.quantity, 0);
  const total = parsed.lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0);
  const merchantOk = !expected.merchant || parsed.merchant === expected.merchant;
  const totalOk = expected.total == null || Math.abs(total - expected.total) < 0.005;
  console.log(
    `  => ${okCount}/${rows.length} lines correct, ${extra.length} extra, ` +
      `${items} items, total £${total.toFixed(2)}` +
      (expected.total != null ? ` (receipt £${expected.total.toFixed(2)})` : ""),
  );
  if (okCount !== rows.length || extra.length || !merchantOk || !totalOk) failed++;
}
process.exit(failed ? 1 : 0);
