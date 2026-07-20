import Fastify, { type FastifyInstance } from "fastify";
import { registerHealth } from "./routes/health.js";
import { registerItems } from "./routes/items.js";
import { registerTaxonomy } from "./routes/taxonomy.js";
import { registerLookup } from "./routes/lookup.js";

/** Build the Fastify app. Call migrate()/seedIfEmpty() before this so the
 *  repositories' prepared statements bind against existing tables. */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

  app.register(registerHealth, { prefix: "/api" });
  app.register(registerItems, { prefix: "/api" });
  app.register(registerTaxonomy, { prefix: "/api" });
  app.register(registerLookup, { prefix: "/api" });

  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ error: { message: "not found" } }),
  );

  return app;
}
