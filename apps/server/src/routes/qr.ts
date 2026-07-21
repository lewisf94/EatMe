import type { FastifyInstance } from "fastify";
import { getByQrUid } from "../repo/containers.js";
import { getLot } from "../repo/stockLots.js";
import { getProduct } from "../repo/products.js";

export async function registerQr(app: FastifyInstance): Promise<void> {
  // A printed QR resolves to its container, its current lot, and the product —
  // enough for the quick "how much is left?" screen.
  app.get("/qr/:qrUid", async (req, reply) => {
    const { qrUid } = req.params as { qrUid: string };
    const container = getByQrUid(qrUid);
    if (!container) return reply.code(404).send({ error: { message: "not found" } });
    const lot = container.currentStockLotId ? getLot(container.currentStockLotId) : undefined;
    const product = container.productId
      ? getProduct(container.productId)
      : lot
        ? getProduct(lot.productId)
        : undefined;
    return { data: { container, lot: lot ?? null, product: product ?? null } };
  });
}
