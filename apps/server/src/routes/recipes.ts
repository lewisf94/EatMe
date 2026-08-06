import type { FastifyInstance } from "fastify";
import { RecipeInput, RecipePatch, civilToday, byUrgency } from "@eatme/shared";
import {
  listRecipes,
  getRecipe,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  hasStarterRecipe,
} from "../repo/recipes.js";
import { listInventory } from "../repo/inventory.js";
import { dietaryRequirements, timezone } from "../repo/settings.js";
import { rankUseItUp } from "../services/recipes.js";
import { recipeMeetsRequirements, STARTER_RECIPES } from "../data/starterRecipes.js";
import { atomic } from "../db.js";
import { addShopping, hasOpenName } from "../repo/shopping.js";
import { lotsForProduct, logEvent } from "../repo/stockLots.js";
import { mirrorShopping } from "../services/homeAssistant.js";

function currentHit(id: string) {
  const recipe = getRecipe(id);
  if (!recipe) return null;
  const rows = listInventory({}, civilToday(timezone())).sort(byUrgency);
  return (
    rankUseItUp([recipe], rows)[0] ?? {
      recipe,
      matchedUrgentCount: 0,
      matchedItems: [],
      missing: [],
    }
  );
}

export async function registerRecipes(app: FastifyInstance): Promise<void> {
  app.get("/recipes", async () => ({ data: listRecipes() }));

  app.get("/recipes/starter-pack", async () => {
    const requirements = dietaryRequirements();
    return {
      data: {
        requirements,
        recipes: STARTER_RECIPES.filter((recipe) =>
          recipeMeetsRequirements(recipe.dietaryTags, requirements),
        ).map((recipe) => ({
          ...recipe,
          alreadyImported: hasStarterRecipe(recipe.key),
        })),
      },
    };
  });

  app.post("/recipes/starter-pack/import", async () => {
    const requirements = dietaryRequirements();
    const compatible = STARTER_RECIPES.filter((recipe) =>
      recipeMeetsRequirements(recipe.dietaryTags, requirements),
    );
    const added = atomic(() => {
      let count = 0;
      for (const starter of compatible) {
        if (hasStarterRecipe(starter.key)) continue;
        const { key, ...input } = starter;
        createRecipe(input, key);
        count++;
      }
      return count;
    });
    return {
      data: {
        added,
        alreadyImported: compatible.length - added,
        requirements,
      },
    };
  });

  app.get("/recipes/use-it-up", async () => {
    const rows = listInventory({}, civilToday(timezone())).sort(byUrgency);
    const requirements = dietaryRequirements();
    const recipes = listRecipes().filter((recipe) =>
      recipeMeetsRequirements(recipe.dietaryTags, requirements),
    );
    return {
      data: {
        // Useful even with no recipes saved yet: the things to eat, listed plainly.
        expiring: rows.filter((r) => r.status !== "ok"),
        recipes: rankUseItUp(recipes, rows),
      },
    };
  });

  app.get("/recipes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const recipe = getRecipe(id);
    if (!recipe) return reply.code(404).send({ error: { message: "not found" } });
    return { data: recipe };
  });

  app.post("/recipes/:id/shop-missing", async (req, reply) => {
    const { id } = req.params as { id: string };
    const hit = currentHit(id);
    if (!hit) return reply.code(404).send({ error: { message: "not found" } });
    const added = atomic(() => {
      const names: string[] = [];
      for (const name of new Set(hit.missing.map((item) => item.trim()).filter(Boolean))) {
        if (hasOpenName(name)) continue;
        addShopping({ name });
        names.push(name);
      }
      return names;
    });
    for (const name of added) void mirrorShopping("add_item", name);
    return { data: { added, skipped: hit.missing.length - added.length } };
  });

  // Cooking is an audit event, not a guessed quantity change. The user can
  // still set the exact amount left with the existing fraction controls.
  app.post("/recipes/:id/cooked", async (req, reply) => {
    const { id } = req.params as { id: string };
    const hit = currentHit(id);
    if (!hit) return reply.code(404).send({ error: { message: "not found" } });
    const used = atomic(() => {
      const names: string[] = [];
      for (const match of hit.matchedItems) {
        const lot = lotsForProduct(match.productId).find((candidate) => !candidate.archivedAt);
        if (!lot) continue;
        logEvent(lot.id, "cooked");
        names.push(match.name);
      }
      return names;
    });
    return { data: { used } };
  });

  app.post("/recipes", async (req, reply) => {
    const parsed = RecipeInput.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid recipe", issues: parsed.error.issues } });
    return reply.code(201).send({ data: atomic(() => createRecipe(parsed.data)) });
  });

  app.patch("/recipes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = RecipePatch.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid recipe", issues: parsed.error.issues } });
    const recipe = atomic(() => updateRecipe(id, parsed.data));
    if (!recipe) return reply.code(404).send({ error: { message: "not found" } });
    return { data: recipe };
  });

  app.delete("/recipes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!deleteRecipe(id)) return reply.code(404).send({ error: { message: "not found" } });
    return { data: { ok: true } };
  });
}
