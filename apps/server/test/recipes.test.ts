import { describe, it, expect } from "vitest";
import type { Recipe, Status } from "@eatme/shared";
import { rankUseItUp, type RankRow } from "../src/services/recipes.js";

const recipe = (name: string, ingredients: string[]): Recipe => ({
  id: name,
  name,
  url: null,
  notes: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  ingredients,
});
const row = (name: string, status: Status): RankRow => ({ productId: name, name, status });

describe("rankUseItUp", () => {
  it("ranks a recipe that uses expiring food above one that doesn't", () => {
    const rows = [row("Fresh pesto", "use_soon"), row("Plain flour", "ok")];
    const hits = rankUseItUp(
      [recipe("Pancakes", ["flour"]), recipe("Pesto pasta", ["pesto"])],
      rows,
    );
    expect(hits.map((h) => h.recipe.name)).toEqual(["Pesto pasta"]);
    expect(hits[0].matchedItems).toEqual([{ productId: "Fresh pesto", name: "Fresh pesto" }]);
  });

  it("puts the recipe that rescues the most food first", () => {
    const rows = [
      row("Chopped tomatoes", "use_soon"),
      row("Fresh basil", "past_best"),
      row("Mozzarella", "use_soon"),
    ];
    const hits = rankUseItUp(
      [recipe("Tomato soup", ["tomato"]), recipe("Caprese", ["tomato", "basil", "mozzarella"])],
      rows,
    );
    expect(hits.map((h) => h.recipe.name)).toEqual(["Caprese", "Tomato soup"]);
    expect(hits[0].matchedUrgentCount).toBe(3);
  });

  it("never suggests cooking something past its use-by", () => {
    const rows = [row("Raw chicken", "past_use_by")];
    expect(rankUseItUp([recipe("Chicken pie", ["chicken"])], rows)).toEqual([]);
  });

  it("counts an opened jar that is drifting as worth using up", () => {
    const rows = [row("Mango chutney", "quality_declining")];
    expect(rankUseItUp([recipe("Curry night", ["chutney"])], rows)).toHaveLength(1);
  });

  it("lists only ingredients you don't own at all as missing", () => {
    const rows = [row("Fresh pesto", "use_soon"), row("Spaghetti", "ok")];
    const [hit] = rankUseItUp([recipe("Pesto pasta", ["pesto", "spaghetti", "pine nuts"])], rows);
    expect(hit.missing).toEqual(["pine nuts"]);
  });

  it("matches loosely and case-insensitively", () => {
    const rows = [row("Tesco Chickpeas 400g", "use_soon")];
    expect(rankUseItUp([recipe("Hummus", ["CHICKPEA"])], rows)).toHaveLength(1);
  });

  it("breaks ties on how much you'd still need to buy, then name", () => {
    const rows = [row("Fresh pesto", "use_soon")];
    const hits = rankUseItUp(
      [
        recipe("Zebra bake", ["pesto", "truffle"]),
        recipe("Alpha toast", ["pesto", "caviar"]),
        recipe("Simple pesto pasta", ["pesto"]),
      ],
      rows,
    );
    expect(hits.map((h) => h.recipe.name)).toEqual([
      "Simple pesto pasta",
      "Alpha toast",
      "Zebra bake",
    ]);
  });
});
