import type { FastifyInstance } from "fastify";
import { db } from "../db.js";

export async function registerHealth(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_req, reply) => {
    try {
      // Touch a real on-disk table rather than only reporting that Fastify's
      // event loop is alive. The watchdog can now restart a broken DB process.
      db.prepare("SELECT id FROM _migrations ORDER BY id DESC LIMIT 1").get();
      return { data: { ok: true } };
    } catch {
      return reply.code(503).send({ error: { message: "database unavailable" } });
    }
  });
}
