import type { FastifyInstance } from "fastify";
import { IntakeInput, civilToday, byUrgency } from "@eatme/shared";
import { listInventory } from "../repo/inventory.js";
import { findOrCreateProduct } from "../repo/products.js";
import { createContainer } from "../repo/containers.js";
import { timezone } from "../repo/settings.js";
import { idempotent } from "../services/idempotency.js";
import { createGuidedLot, resolveNewProduct } from "../services/foodGuidance.js";

export async function registerInventory(app: FastifyInstance): Promise<void> {
  // The cupboard: one aggregated row per product.
  app.get("/inventory", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const today = civilToday(timezone());
    let rows = listInventory(
      {
        q: q.q,
        locationId: q.location,
        includeArchived: q.includeArchived === "1" || q.includeArchived === "true",
      },
      today,
    );

    if (q.status) rows = rows.filter((r) => r.status === q.status);

    const sort = q.sort ?? "urgency";
    rows.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "recent") return b.createdAt.localeCompare(a.createdAt);
      return byUrgency(a, b);
    });

    return { data: rows };
  });

  // Add stock in one call: find-or-create the product, then a lot + a labelled
  // container. Most adds are a brand-new product with a single lot.
  app.post("/intake", async (req, reply) => {
    const parsed = IntakeInput.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid intake", issues: parsed.error.issues } });
    const d = parsed.data;
    const result = idempotent("intake", d.opId, () => {
      const { productInput } = resolveNewProduct({
        name: d.name,
        brand: d.brand,
        barcode: d.barcode,
        categoryId: d.categoryId,
        defaultLocationId: d.locationId,
        guidanceRuleId: d.guidanceRuleId,
        categoryHints: d.categoryHints,
        packageQuantity: d.packageQuantity,
        packageUnit: d.packageUnit,
        imageUrl: d.imageUrl,
      });
      const product = findOrCreateProduct(productInput);
      const lot = createGuidedLot(product, {
        locationId: d.locationId,
        count: d.count,
        fractionLeft: d.fractionLeft,
        dateType: d.dateType,
        dateValue: d.dateValue,
        openedAt: d.openedAt,
        openLifeDaysOverride: d.openLifeDaysOverride,
        source: "manual",
      });
      const container = createContainer({
        name: product.name,
        productId: product.id,
        locationId: lot.locationId,
        currentStockLotId: lot.id,
      });
      return { product, lot, container };
    });
    return { data: result };
  });
}
