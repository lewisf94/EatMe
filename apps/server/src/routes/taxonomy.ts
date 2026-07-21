import type { FastifyInstance } from "fastify";
import { CategoryInput, CategoryPatch, LocationInput, LocationPatch } from "@whattoeat/shared";
import { listCategories, createCategory, updateCategory } from "../repo/categories.js";
import { listLocations, createLocation, updateLocation } from "../repo/locations.js";

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

  app.patch("/categories/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = CategoryPatch.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid category", issues: parsed.error.issues } });
    const cat = updateCategory(id, parsed.data);
    if (!cat) return reply.code(404).send({ error: { message: "not found" } });
    return { data: cat };
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

  app.patch("/locations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = LocationPatch.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid location", issues: parsed.error.issues } });
    const loc = updateLocation(id, parsed.data);
    if (!loc) return reply.code(404).send({ error: { message: "not found" } });
    return { data: loc };
  });
}
