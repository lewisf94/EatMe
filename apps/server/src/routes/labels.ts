import type { FastifyInstance, FastifyRequest } from "fastify";
import { getByQrUid, listLabelContainers } from "../repo/containers.js";
import { getLot } from "../repo/stockLots.js";
import { makePrintableLabel, renderLabelPage } from "../services/labels.js";

const MAX_LABELS = 200;

function requestOrigin(req: FastifyRequest): string {
  return `${req.protocol}://${req.host}`;
}

function currentProductId(qrUid: string): string | undefined {
  const container = getByQrUid(qrUid);
  if (!container) return;
  if (container.productId) return container.productId;
  return container.currentStockLotId ? getLot(container.currentStockLotId)?.productId : undefined;
}

export async function registerLabels(app: FastifyInstance): Promise<void> {
  // Printed codes land here. This route deliberately lives outside /api so it
  // can be opened by the phone camera and then load the normal authenticated UI.
  app.get("/i/:qrUid", async (req, reply) => {
    const { qrUid } = req.params as { qrUid: string };
    const productId = currentProductId(qrUid);
    if (!productId) return reply.code(404).send({ error: { message: "label not found" } });
    return reply
      .code(302)
      .header("location", `/product/${encodeURIComponent(productId)}`)
      .send();
  });

  app.get("/api/labels/containers", async (req) => {
    const { productId } = req.query as { productId?: string };
    return { data: listLabelContainers(productId?.trim() || undefined) };
  });

  app.get("/api/labels", async (req, reply) => {
    const query = req.query as { ids?: string; all?: string };
    const available = listLabelContainers();
    let chosen = available;

    if (query.all !== "1") {
      const ids = (query.ids ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (ids.length === 0) {
        return reply.code(400).send({ error: { message: "choose at least one label" } });
      }
      const byId = new Map(available.map((container) => [container.id, container]));
      chosen = ids.map((id) => byId.get(id)).filter((item) => item != null);
    }

    if (chosen.length === 0) {
      return reply.code(404).send({ error: { message: "no labels found" } });
    }
    if (chosen.length > MAX_LABELS) {
      return reply
        .code(400)
        .send({ error: { message: `print no more than ${MAX_LABELS} labels at once` } });
    }

    const origin = requestOrigin(req);
    const labels = await Promise.all(
      chosen.map((container) => makePrintableLabel(container, origin)),
    );
    return reply.type("text/html; charset=utf-8").send(renderLabelPage(labels));
  });
}
