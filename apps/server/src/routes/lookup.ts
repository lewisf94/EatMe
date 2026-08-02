import type { FastifyInstance } from "fastify";
import { lookup } from "../services/off.js";

export async function registerLookup(app: FastifyInstance): Promise<void> {
  app.get("/lookup/:barcode", async (req, reply) => {
    const barcode = (req.params as { barcode: string }).barcode.trim();
    if (!/^\d{4,24}$/.test(barcode)) {
      return reply.code(400).send({ error: { message: "barcode must contain 4 to 24 digits" } });
    }
    try {
      return { data: await lookup(barcode) };
    } catch (err) {
      return reply.code(502).send({ error: { message: (err as Error).message } });
    }
  });
}
