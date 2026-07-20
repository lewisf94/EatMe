import type { FastifyInstance } from "fastify";
import { CategoryInput, LocationInput } from "@whattoeat/shared";
import { listCategories, createCategory } from "../repo/categories.js";
import { listLocations, createLocation } from "../repo/locations.js";

export async function registerTaxonomy(app: FastifyInstance): Promise<void> {
  app.get("/categories", async () => ({ data: listCategories() }));

  app.post("/categories", async (req, reply) => {
    const parsed = CategoryInput.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid category", issues: parsed.error.issues } });
    return { data: createCategory(parsed.data) };
  });

  app.get("/locations", async () => ({ data: listLocations() }));

  app.post("/locations", async (req, reply) => {
    const parsed = LocationInput.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid location", issues: parsed.error.issues } });
    return { data: createLocation(parsed.data) };
  });
}
