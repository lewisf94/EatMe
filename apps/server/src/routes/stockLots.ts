import type { FastifyInstance } from "fastify";
import { StockLotInput, StockLotPatch, EventInput, ArchiveInput } from "@eatme/shared";
import { createLot, updateLot, archiveLot, addEvent } from "../repo/stockLots.js";

export async function registerStockLots(app: FastifyInstance): Promise<void> {
  app.post("/stock-lots", async (req, reply) => {
    const parsed = StockLotInput.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid stock lot", issues: parsed.error.issues } });
    return { data: createLot(parsed.data) };
  });

  app.patch("/stock-lots/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = StockLotPatch.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid patch", issues: parsed.error.issues } });
    const lot = updateLot(id, parsed.data);
    if (!lot) return reply.code(404).send({ error: { message: "not found" } });
    return { data: lot };
  });

  app.post("/stock-lots/:id/archive", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = ArchiveInput.safeParse(req.body ?? {});
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid archive reason", issues: parsed.error.issues } });
    const lot = archiveLot(id, parsed.data.reason);
    if (!lot) return reply.code(404).send({ error: { message: "not found" } });
    return { data: lot };
  });

  app.post("/stock-lots/:id/events", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = EventInput.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid event", issues: parsed.error.issues } });
    const lot = addEvent(id, parsed.data.event, parsed.data.fractionAfter ?? null);
    if (!lot) return reply.code(404).send({ error: { message: "not found" } });
    return { data: lot };
  });
}
