import {
  civilToday,
  type FoodGuidanceSuggestion,
  type Product,
  type ProductInput,
  type StockLot,
} from "@eatme/shared";
import {
  GUIDANCE_SOURCES,
  matchFoodGuidanceRule,
  type FoodGuidanceRule,
} from "../data/foodGuidance.js";
import { getCategoryByGuidanceKey, listCategories } from "../repo/categories.js";
import { getLocationByGuidanceKey, listLocations } from "../repo/locations.js";
import { createLot } from "../repo/stockLots.js";
import { timezone } from "../repo/settings.js";

export function matchFoodGuidance(
  name: string,
  categoryHints: string[] = [],
  preferredRuleId?: string | null,
): FoodGuidanceRule {
  return matchFoodGuidanceRule(name, categoryHints, preferredRuleId);
}

export function addCivilDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const sourceMap = new Map(GUIDANCE_SOURCES.map((source) => [source.id, source]));

export function resolveFoodGuidance(input: {
  name: string;
  brand?: string | null;
  categoryHints?: string[];
  purchasedAt?: string;
  preferredRuleId?: string | null;
}): FoodGuidanceSuggestion {
  const rule = matchFoodGuidance(
    `${input.name} ${input.brand ?? ""}`,
    input.categoryHints,
    input.preferredRuleId,
  );
  const category =
    getCategoryByGuidanceKey(rule.categoryKey) ??
    getCategoryByGuidanceKey("other_food") ??
    listCategories()[0];
  const location =
    getLocationByGuidanceKey(rule.locationKey) ??
    getLocationByGuidanceKey("cupboard") ??
    listLocations()[0];
  if (!category || !location) throw new Error("food guidance taxonomy is not installed");

  const purchasedAt = input.purchasedAt ?? civilToday(timezone());
  return {
    ruleId: rule.id,
    categoryId: category.id,
    categoryName: category.name,
    locationId: location.id,
    locationName: location.name,
    estimatedDate: rule.unopenedDays == null ? null : addCivilDays(purchasedAt, rule.unopenedDays),
    estimatedDays: rule.unopenedDays,
    openedDays: rule.openedDays ?? null,
    confidence: rule.confidence,
    note: rule.note,
    sources: rule.sourceIds.flatMap((id) => {
      const source = sourceMap.get(id);
      return source ? [{ id: source.id, name: source.name, url: source.url }] : [];
    }),
  };
}

export type NewProductWithGuidance = {
  name: string;
  brand?: string;
  barcode?: string;
  categoryId?: string;
  defaultLocationId?: string;
  guidanceRuleId?: string;
  categoryHints?: string[];
  packageQuantity?: number;
  packageUnit?: string;
  imageUrl?: string;
};

export function resolveNewProduct(input: NewProductWithGuidance): {
  productInput: ProductInput;
  guidance: FoodGuidanceSuggestion;
} {
  const guidance = resolveFoodGuidance({
    name: input.name,
    brand: input.brand,
    categoryHints: input.categoryHints,
    preferredRuleId: input.guidanceRuleId,
  });
  return {
    guidance,
    productInput: {
      name: input.name,
      brand: input.brand,
      barcode: input.barcode,
      categoryId: input.categoryId ?? guidance.categoryId,
      defaultLocationId: input.defaultLocationId ?? guidance.locationId,
      guidanceRuleId: guidance.ruleId,
      packageQuantity: input.packageQuantity,
      packageUnit: input.packageUnit,
      imageUrl: input.imageUrl,
    },
  };
}

export type GuidedLotInput = {
  locationId?: string;
  count?: number;
  fractionLeft?: number;
  dateType?: "use_by" | "best_before";
  dateValue?: string;
  openedAt?: string;
  openLifeDaysOverride?: number;
  purchasedAt?: string;
  source?: string;
};

/**
 * The only stock-creation path routes should call. It applies the same purchase
 * date, location, estimated quality reminder and opened-life default no matter
 * whether the item came from manual entry, a barcode, a receipt or shopping.
 */
export function createGuidedLot(product: Product, input: GuidedLotInput = {}): StockLot {
  const purchasedAt = input.purchasedAt ?? civilToday(timezone());
  const guidance = resolveFoodGuidance({
    name: product.name,
    brand: product.brand,
    purchasedAt,
    preferredRuleId: product.guidanceRuleId,
  });
  const hasPrintedDate = Boolean(input.dateValue);
  return createLot({
    productId: product.id,
    locationId: input.locationId ?? product.defaultLocationId ?? guidance.locationId,
    count: input.count ?? 1,
    fractionLeft: input.fractionLeft ?? 1,
    purchasedAt,
    dateType: hasPrintedDate
      ? (input.dateType ?? "best_before")
      : guidance.estimatedDate
        ? "best_before"
        : undefined,
    dateValue: hasPrintedDate ? input.dateValue : (guidance.estimatedDate ?? undefined),
    dateEstimated: !hasPrintedDate && guidance.estimatedDate != null,
    openedAt: input.openedAt,
    openLifeDaysOverride: input.openLifeDaysOverride ?? guidance.openedDays ?? undefined,
    source: input.source ?? "manual",
  });
}
