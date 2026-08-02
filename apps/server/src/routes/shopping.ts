import type { FastifyInstance } from "fastify";
import { ShoppingInput } from "@eatme/shared";
import {
  listShopping,
  addShopping,
  setDone,
  deleteShopping,
  getShopping,
} from "../repo/shopping.js";
import { getProduct } from "../repo/products.js";
import { logEvent } from "../repo/stockLots.js";
import { createGuidedLot } from "../services/foodGuidance.js";
import { atomic } from "../db.js";
import { mirrorShopping } from "../services/homeAssistant.js";

export async function registerShopping(app: FastifyInstance): Promise<void> {
  app.get("/shopping-list", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    return { data: listShopping(q.includeDone === "1" || q.includeDone === "true") };
  });

  app.post("/shopping-list", async (req, reply) => {
    const parsed = ShoppingInput.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid item", issues: parsed.error.issues } });

    const { productId } = parsed.data;
    // A row can come from a product you finished, or be plain free text.
    const name = parsed.data.name ?? (productId ? getProduct(productId)?.name : undefined);
    if (!name)
      return reply.code(400).send({ error: { message: "a name or a known product is required" } });
    const item = addShopping({ name, productId });
    void mirrorShopping("add_item", item.name);
    return reply.code(201).send({ data: item });
  });

  // Ticking a row that came from a product puts a fresh pack back in the
  // cupboard — that's what "bought it again" means once you're home.
  app.post("/shopping-list/:id/done", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = atomic(() => {
      const before = getShopping(id);
      if (!before) return null;

      const item = setDone(id, true);
      if (!item) return null;
      let lot = null;
      if (before.productId && !before.doneAt) {
        const product = getProduct(before.productId);
        if (product) {
          lot = createGuidedLot(product, { count: 1, fractionLeft: 1, source: "shopping" });
          logEvent(lot.id, "repurchased");
        }
      }
      return { item, lot };
    });
    if (!result) return reply.code(404).send({ error: { message: "not found" } });
    void mirrorShopping("complete_item", result.item.name);
    return { data: result };
  });

  app.post("/shopping-list/:id/undone", async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = setDone(id, false);
    if (!item) return reply.code(404).send({ error: { message: "not found" } });
    void mirrorShopping("incomplete_item", item.name);
    return { data: item };
  });

  app.delete("/shopping-list/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = getShopping(id);
    if (!deleteShopping(id)) return reply.code(404).send({ error: { message: "not found" } });
    if (item) void mirrorShopping("remove_item", item.name);
    return { data: { ok: true } };
  });
}
