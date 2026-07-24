import type { FastifyInstance } from "fastify";
import { RecipeInput, RecipePatch, civilToday, byUrgency } from "@eatme/shared";
import {
  listRecipes,
  getRecipe,
  createRecipe,
  updateRecipe,
  deleteRecipe,
} from "../repo/recipes.js";
import { listInventory } from "../repo/inventory.js";
import { timezone } from "../repo/settings.js";
import { rankUseItUp } from "../services/recipes.js";

export async function registerRecipes(app: FastifyInstance): Promise<void> {
  app.get("/recipes", async () => ({ data: listRecipes() }));

  app.get("/recipes/use-it-up", async () => {
    const rows = listInventory({}, civilToday(timezone())).sort(byUrgency);
    return {
      data: {
        // Useful even with no recipes saved yet: the things to eat, listed plainly.
        expiring: rows.filter((r) => r.status !== "ok"),
        recipes: rankUseItUp(listRecipes(), rows),
      },
    };
  });

  app.get("/recipes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const recipe = getRecipe(id);
    if (!recipe) return reply.code(404).send({ error: { message: "not found" } });
    return { data: recipe };
  });

  app.post("/recipes", async (req, reply) => {
    const parsed = RecipeInput.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid recipe", issues: parsed.error.issues } });
    return reply.code(201).send({ data: createRecipe(parsed.data) });
  });

  app.patch("/recipes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = RecipePatch.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid recipe", issues: parsed.error.issues } });
    const recipe = updateRecipe(id, parsed.data);
    if (!recipe) return reply.code(404).send({ error: { message: "not found" } });
    return { data: recipe };
  });

  app.delete("/recipes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!deleteRecipe(id)) return reply.code(404).send({ error: { message: "not found" } });
    return { data: { ok: true } };
  });
}
