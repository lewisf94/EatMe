import type { FastifyInstance } from "fastify";
import { lookup } from "../services/off.js";

export async function registerLookup(app: FastifyInstance): Promise<void> {
  app.get("/lookup/:barcode", async (req, reply) => {
    const { barcode } = req.params as { barcode: string };
    try {
      return { data: await lookup(barcode) };
    } catch (err) {
      return reply.code(502).send({ error: { message: (err as Error).message } });
    }
  });
}
