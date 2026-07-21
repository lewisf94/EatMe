import type { FastifyInstance } from "fastify";
import { ProductInput, ProductPatch } from "@eatme/shared";
import { getProduct, createProduct, updateProduct } from "../repo/products.js";
import { lotsForProduct } from "../repo/stockLots.js";

export async function registerProducts(app: FastifyInstance): Promise<void> {
  app.get("/products/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = getProduct(id);
    if (!product) return reply.code(404).send({ error: { message: "not found" } });
    const q = req.query as Record<string, string | undefined>;
    const lots = lotsForProduct(id, q.includeArchived === "1" || q.includeArchived === "true");
    return { data: { product, lots } };
  });

  app.post("/products", async (req, reply) => {
    const parsed = ProductInput.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid product", issues: parsed.error.issues } });
    return { data: createProduct(parsed.data) };
  });

  app.patch("/products/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = ProductPatch.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid patch", issues: parsed.error.issues } });
    const product = updateProduct(id, parsed.data);
    if (!product) return reply.code(404).send({ error: { message: "not found" } });
    return { data: product };
  });
}
