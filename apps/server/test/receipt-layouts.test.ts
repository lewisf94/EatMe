import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReceipt } from "../src/services/receipt/parse.js";

type Layout = {
  id: string;
  merchant: string;
  rows: Array<[string, string]>;
  lines: Array<{ name: string; quantity: number; lineTotal: number }>;
};

const { receipts } = JSON.parse(
  readFileSync(new URL("./fixtures/receipt-layouts.json", import.meta.url), "utf8"),
) as { receipts: Layout[] };

// The row layouts of the main UK supermarkets, as clean text. The same
// receipts are rendered as photos by scripts/receipt-samples.py.
describe("supermarket receipt layouts", () => {
  for (const receipt of receipts) {
    it(`reads every product of a ${receipt.merchant} receipt`, () => {
      const lines = receipt.rows
        .map(([left, right]) => ({ text: `${left}   ${right}`.trim() }))
        .filter((l) => l.text);
      const parsed = parseReceipt({ lines });
      expect(parsed.merchant).toBe(receipt.merchant);
      expect(
        parsed.lines.map((l) => ({
          name: l.normalizedText,
          quantity: l.quantity,
          lineTotal: l.lineTotal,
        })),
      ).toEqual(receipt.lines);
    });
  }
});
