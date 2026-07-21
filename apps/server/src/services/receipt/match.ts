import type { ReceiptMatch } from "@eatme/shared";
import { normalize } from "./parse.js";

export type ProductLite = { id: string; name: string; brand: string | null; norm: string };
export type MatchContext = {
  products: ProductLite[];
  aliasMap: Map<string, string>; // normalized line text → productId (for this retailer)
};

/** Build a match context from already-fetched data (kept pure — no DB imports —
 *  so the matcher can be unit-tested without a migrated database). */
export function makeContext(
  products: Array<{ id: string; name: string; brand: string | null }>,
  aliases: Array<{ normalized_text: string; product_id: string }>,
): MatchContext {
  return {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      norm: normalize(`${p.brand ?? ""} ${p.name}`),
    })),
    aliasMap: new Map(aliases.map((a) => [a.normalized_text, a.product_id])),
  };
}

const tokens = (s: string) => s.split(/\s+/).filter((t) => t.length > 1);
function jaccard(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Match a normalized receipt line to a product: a learned alias wins, then an
 * exact normalized-name hit, then token-similarity (a confident best becomes the
 * match; the rest are suggestions). No match → the review offers "new".
 * **Never** calls Open Food Facts per line. Pure over the context (unit-tested).
 */
export function matchLine(
  normalizedText: string,
  ctx: MatchContext,
): {
  match: ReceiptMatch | null;
  suggestions: Array<{ productId: string; name: string; brand: string | null }>;
} {
  const byId = (id: string) => ctx.products.find((p) => p.id === id);

  const aliasPid = ctx.aliasMap.get(normalizedText);
  if (aliasPid) {
    const p = byId(aliasPid);
    if (p) return { match: { productId: p.id, name: p.name, brand: p.brand, via: "alias" }, suggestions: [] }; // prettier-ignore
  }

  const exact = ctx.products.find((p) => p.norm === normalizedText);
  if (exact)
    return {
      match: { productId: exact.id, name: exact.name, brand: exact.brand, via: "exact" },
      suggestions: [],
    };

  const scored = ctx.products
    .map((p) => ({ p, s: jaccard(normalizedText, p.norm) }))
    .filter((x) => x.s > 0.2)
    .sort((a, b) => b.s - a.s);
  const asSug = (p: ProductLite) => ({ productId: p.id, name: p.name, brand: p.brand });

  if (scored[0] && scored[0].s >= 0.5) {
    return {
      match: { ...asSug(scored[0].p), via: "fuzzy" },
      suggestions: scored.slice(1, 3).map((x) => asSug(x.p)),
    };
  }
  return { match: null, suggestions: scored.slice(0, 3).map((x) => asSug(x.p)) };
}
