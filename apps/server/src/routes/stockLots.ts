import type { FastifyInstance } from "fastify";
import { StockLotCreateInput, StockLotPatch, EventInput, ArchiveInput } from "@eatme/shared";
import { updateLot, archiveLot, restoreLot, addEvent, getLot } from "../repo/stockLots.js";
import { idempotent } from "../services/idempotency.js";
import { getProduct } from "../repo/products.js";
import { addShopping, hasOpenFor } from "../repo/shopping.js";
import { createGuidedLot } from "../services/foodGuidance.js";
import { mirrorShopping } from "../services/homeAssistant.js";

/** Running a pack down to empty is the moment you know you need more, so it
 *  goes straight on the shopping list. Deduped, so finishing a second pack of
 *  the same thing doesn't add it twice. The pack itself is left alone —
 *  removing it stays an explicit choice with a reason. */
function offerToRebuy(lotId: string): void {
  const lot = getLot(lotId);
  if (!lot || hasOpenFor(lot.productId)) return;
  const product = getProduct(lot.productId);
  if (product) {
    addShopping({ name: product.name, productId: product.id });
    void mirrorShopping("add_item", product.name);
  }
}

export async function registerStockLots(app: FastifyInstance): Promise<void> {
  app.post("/stock-lots", async (req, reply) => {
    const parsed = StockLotCreateInput.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid stock lot", issues: parsed.error.issues } });
    const product = getProduct(parsed.data.productId);
    if (!product) return reply.code(404).send({ error: { message: "product not found" } });
    return { data: createGuidedLot(product, parsed.data) };
  });

  app.patch("/stock-lots/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = StockLotPatch.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid patch", issues: parsed.error.issues } });
    const lot = updateLot(id, parsed.data);
    if (!lot) return reply.code(404).send({ error: { message: "not found" } });
    return { data: lot };
  });

  app.post("/stock-lots/:id/archive", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = ArchiveInput.safeParse(req.body ?? {});
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid archive reason", issues: parsed.error.issues } });
    const lot = archiveLot(id, parsed.data.reason);
    if (!lot) return reply.code(404).send({ error: { message: "not found" } });
    return { data: lot };
  });

  app.post("/stock-lots/:id/restore", async (req, reply) => {
    const { id } = req.params as { id: string };
    const lot = restoreLot(id);
    if (!lot) return reply.code(404).send({ error: { message: "not found" } });
    return { data: lot };
  });

  app.post("/stock-lots/:id/events", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = EventInput.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid event", issues: parsed.error.issues } });
    const lot = idempotent("lot-event", parsed.data.opId, () => {
      const updated = addEvent(id, parsed.data.event, parsed.data.fractionAfter ?? null);
      if (updated && (parsed.data.fractionAfter === 0 || parsed.data.event === "finished"))
        offerToRebuy(id);
      return updated;
    });
    if (!lot) return reply.code(404).send({ error: { message: "not found" } });
    return { data: lot };
  });
}
