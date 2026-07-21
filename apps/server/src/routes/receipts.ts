import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { ReceiptConfirmInput, type ReceiptDraft, type ReceiptDraftLine } from "@eatme/shared";
import { db } from "../db.js";
import { ocrProvider } from "../services/receipt/ocr.js";
import { parseReceipt } from "../services/receipt/parse.js";
import { makeContext, matchLine, type MatchContext } from "../services/receipt/match.js";
import * as receipts from "../repo/receipts.js";
import { allProducts, createProduct, getProduct } from "../repo/products.js";
import { createLot } from "../repo/stockLots.js";
import { listLocations } from "../repo/locations.js";

const retailerOf = (p: { merchant: string | null }) => p.merchant ?? "";

function contextFor(retailer: string): MatchContext {
  return makeContext(allProducts(), receipts.aliasesFor(retailer));
}

/** Rebuild the reviewable draft (persisted lines + freshly-computed matches). */
function draftFor(purchase: receipts.PurchaseRow): ReceiptDraft {
  const ctx = contextFor(retailerOf(purchase));
  const lines: ReceiptDraftLine[] = receipts.linesFor(purchase.id).map((l) => {
    const m = matchLine(l.normalized_text, ctx);
    return {
      id: l.id,
      lineNo: l.line_no,
      rawText: l.raw_text,
      normalizedText: l.normalized_text,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      lineTotal: l.line_total,
      confidence: l.extraction_confidence,
      status: l.status,
      match: m.match,
      suggestions: m.suggestions,
    };
  });
  return {
    purchase: {
      id: purchase.id,
      merchant: purchase.merchant,
      purchasedAt: purchase.purchased_at,
      status: purchase.status,
    },
    lines,
  };
}

export async function registerReceipts(app: FastifyInstance): Promise<void> {
  // Upload a receipt image (raw bytes) → OCR (local) → parse → match → draft.
  // We keep only the parsed lines + an image hash; the image itself is discarded.
  app.post("/receipts", async (req, reply) => {
    const image = req.body as Buffer | undefined;
    if (!Buffer.isBuffer(image) || image.length === 0)
      return reply.code(400).send({ error: { message: "expected a receipt image body" } });

    let ocr;
    try {
      ocr = await ocrProvider().extract(image);
    } catch (err) {
      return reply
        .code(502)
        .send({ error: { message: err instanceof Error ? err.message : "OCR failed" } });
    }
    const parsed = parseReceipt(ocr);
    const imageHash = createHash("sha256").update(image).digest("hex");

    const purchase = receipts.createPurchase({
      merchant: parsed.merchant,
      purchasedAt: parsed.purchasedAt,
      source: "receipt",
      imageHash,
    });

    const ctx = contextFor(retailerOf(purchase));
    parsed.lines.forEach((l, i) => {
      const m = matchLine(l.normalizedText, ctx);
      receipts.addLine({
        purchaseId: purchase.id,
        lineNo: i,
        rawText: l.rawText,
        normalizedText: l.normalizedText,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        confidence: l.confidence,
        matchedProductId: m.match?.productId ?? null,
      });
    });

    return { data: draftFor(purchase) };
  });

  app.get("/receipts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const purchase = receipts.getPurchase(id);
    if (!purchase) return reply.code(404).send({ error: { message: "not found" } });
    return { data: draftFor(purchase) };
  });

  // Apply the reviewed decisions in one transaction: create stock lots for the
  // "add" lines and learn an alias for each, so the next receipt auto-matches.
  app.post("/receipts/:id/confirm", async (req, reply) => {
    const { id } = req.params as { id: string };
    const purchase = receipts.getPurchase(id);
    if (!purchase) return reply.code(404).send({ error: { message: "not found" } });

    const parsed = ReceiptConfirmInput.safeParse(req.body ?? {});
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid confirmation", issues: parsed.error.issues } });

    const retailer = retailerOf(purchase);
    const fallbackLocation = parsed.data.defaultLocationId ?? listLocations()[0]?.id;
    const byLineId = new Map(receipts.linesFor(id).map((l) => [l.id, l]));
    const summary = { added: 0, ignored: 0, notTracked: 0, newProducts: 0 };

    db.exec("BEGIN");
    try {
      for (const d of parsed.data.lines) {
        const line = byLineId.get(d.lineId);
        if (!line) continue;

        if (d.action === "ignore") {
          receipts.setLineOutcome(line.id, "ignored", null, null);
          summary.ignored++;
          continue;
        }
        if (d.action === "not_tracked") {
          receipts.setLineOutcome(line.id, "not_tracked", null, null);
          summary.notTracked++;
          continue;
        }

        // action === "add": resolve to a product (existing or newly created)
        let productId = d.productId ?? null;
        if (!productId && d.newProduct) {
          const p = createProduct({
            name: d.newProduct.name,
            brand: d.newProduct.brand,
            categoryId: d.newProduct.categoryId,
          });
          productId = p.id;
          summary.newProducts++;
        }
        if (!productId || !getProduct(productId))
          throw new Error(`line ${line.line_no}: no product to add to`);

        const locationId = d.locationId ?? fallbackLocation;
        if (!locationId) throw new Error("no location available for the stock lot");

        createLot({
          productId,
          locationId,
          count: d.quantity,
          fractionLeft: 1,
          source: "receipt",
        });
        receipts.learnAlias(retailer, line.normalized_text, productId);
        receipts.setLineOutcome(line.id, "added", productId, locationId);
        summary.added++;
      }
      receipts.setPurchaseStatus(id, "confirmed");
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      return reply
        .code(400)
        .send({ error: { message: err instanceof Error ? err.message : "confirmation failed" } });
    }

    return { data: { purchaseId: id, ...summary } };
  });
}
