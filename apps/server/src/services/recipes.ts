// Use-it-up ranking: given the recipes you've saved and what's in the cupboard,
// which recipe would rescue the most food tonight?
//
// Pure and dependency-free so it can be unit-tested directly.
import type { Recipe, Status, UseItUpHit } from "@eatme/shared";

/** A cupboard row, reduced to what ranking actually needs. */
export type RankRow = { productId: string; name: string; status: Status };

/**
 * Worth cooking *now*. Deliberately excludes `past_use_by`: a passed use-by is a
 * safety line, not a nudge, and the app must never suggest cooking it. Opened
 * jars that are drifting (`quality_declining`) are fair game.
 */
const URGENT: ReadonlySet<Status> = new Set<Status>(["use_soon", "past_best", "quality_declining"]);

const hits = (matchText: string, row: RankRow) =>
  row.name.toLowerCase().includes(matchText.trim().toLowerCase());

/** Rank recipes by how many expiring items they'd use up. Recipes that match
 *  nothing urgent are dropped — this list answers "cook this tonight". */
export function rankUseItUp(recipes: Recipe[], rows: RankRow[]): UseItUpHit[] {
  const urgent = rows.filter((r) => URGENT.has(r.status));

  return recipes
    .map((recipe) => {
      const matchedItems: UseItUpHit["matchedItems"] = [];
      const missing: string[] = [];
      for (const ing of recipe.ingredients) {
        if (!ing.trim()) continue;
        const urgentHit = urgent.find((r) => hits(ing, r));
        if (urgentHit) matchedItems.push({ productId: urgentHit.productId, name: urgentHit.name });
        // "Missing" means you don't have it at all — an ingredient you own but
        // that isn't expiring is simply not interesting here.
        else if (!rows.some((r) => hits(ing, r))) missing.push(ing);
      }
      return { recipe, matchedUrgentCount: matchedItems.length, matchedItems, missing };
    })
    .filter((h) => h.matchedUrgentCount > 0)
    .sort(
      (a, b) =>
        b.matchedUrgentCount - a.matchedUrgentCount ||
        a.missing.length - b.missing.length ||
        a.recipe.name.localeCompare(b.recipe.name),
    );
}
