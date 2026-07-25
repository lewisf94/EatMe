import type { FastifyInstance } from "fastify";
import { resolveFoodGuidance } from "../services/foodGuidance.js";

export async function registerGuidance(app: FastifyInstance): Promise<void> {
  app.get("/guidance", async (req, reply) => {
    const query = req.query as {
      name?: string;
      brand?: string;
      categoryHint?: string | string[];
      purchasedAt?: string;
    };
    if (!query.name?.trim()) {
      return reply.code(400).send({ error: { message: "name is required" } });
    }
    const categoryHints =
      typeof query.categoryHint === "string" ? [query.categoryHint] : (query.categoryHint ?? []);
    return {
      data: resolveFoodGuidance({
        name: query.name,
        brand: query.brand,
        categoryHints,
        purchasedAt: query.purchasedAt,
      }),
    };
  });
}
