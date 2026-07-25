import { describe, expect, it } from "vitest";
import {
  FALLBACK_GUIDANCE,
  FOOD_GUIDANCE_RULES,
  GUIDANCE_SOURCES,
  matchFoodGuidanceRule,
} from "../src/data/foodGuidance.js";
import { recipeMeetsRequirements, STARTER_RECIPES } from "../src/data/starterRecipes.js";

describe("local food guidance", () => {
  it("prefers specific rules and respects exclusions", () => {
    expect(matchFoodGuidanceRule("Tesco chicken breasts").id).toBe("raw_poultry");
    expect(matchFoodGuidanceRule("Frozen chicken breasts").id).toBe("frozen_food");
    expect(matchFoodGuidanceRule("Tomato ketchup").id).toBe("table_sauce");
    expect(matchFoodGuidanceRule("Apple juice").id).toBe("juice");
    expect(matchFoodGuidanceRule("Fresh strawberries").locationKey).toBe("fridge");
    expect(matchFoodGuidanceRule("Bananas").locationKey).toBe("counter");
  });

  it("uses barcode category hints and remembers a saved rule", () => {
    expect(matchFoodGuidanceRule("Own brand", ["en:frozen-foods"]).id).toBe("frozen_food");
    expect(matchFoodGuidanceRule("Renamed household item", [], "eggs").id).toBe("eggs");
  });

  it("does not invent a date for an unknown food", () => {
    expect(matchFoodGuidanceRule("Completely unknown item")).toEqual(FALLBACK_GUIDANCE);
    expect(FALLBACK_GUIDANCE.unopenedDays).toBeNull();
  });

  it("backs every generated date with multiple known authoritative sources", () => {
    const sourceIds = new Set(GUIDANCE_SOURCES.map((source) => source.id));
    for (const rule of FOOD_GUIDANCE_RULES.filter((item) => item.unopenedDays != null)) {
      expect(rule.sourceIds.length, rule.id).toBeGreaterThanOrEqual(2);
      for (const id of rule.sourceIds) expect(sourceIds.has(id), `${rule.id}: ${id}`).toBe(true);
    }
  });
});

describe("starter recipes", () => {
  it("has unique keys and dietary metadata for every recipe", () => {
    expect(new Set(STARTER_RECIPES.map((recipe) => recipe.key)).size).toBe(STARTER_RECIPES.length);
    expect(STARTER_RECIPES.length).toBeGreaterThanOrEqual(10);
    for (const recipe of STARTER_RECIPES) {
      expect(recipe.ingredients.length, recipe.key).toBeGreaterThan(1);
      expect(recipe.dietaryTags.length, recipe.key).toBeGreaterThan(0);
    }
  });

  it("allows vegan meals for vegetarian and pescatarian households", () => {
    const curry = STARTER_RECIPES.find((recipe) => recipe.key === "chickpea_curry")!;
    expect(recipeMeetsRequirements(curry.dietaryTags, ["vegan", "gluten_free"])).toBe(true);
    expect(recipeMeetsRequirements(curry.dietaryTags, ["vegetarian"])).toBe(true);
    expect(recipeMeetsRequirements(curry.dietaryTags, ["pescatarian"])).toBe(true);
  });

  it("filters incompatible recipes", () => {
    const bolognese = STARTER_RECIPES.find((recipe) => recipe.key === "spaghetti_bolognese")!;
    expect(recipeMeetsRequirements(bolognese.dietaryTags, ["vegetarian"])).toBe(false);
    expect(recipeMeetsRequirements(bolognese.dietaryTags, ["gluten_free"])).toBe(false);
  });
});
