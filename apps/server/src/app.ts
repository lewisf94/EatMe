import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import { registerHealth } from "./routes/health.js";
import { registerInventory } from "./routes/inventory.js";
import { registerProducts } from "./routes/products.js";
import { registerStockLots } from "./routes/stockLots.js";
import { registerQr } from "./routes/qr.js";
import { registerTaxonomy } from "./routes/taxonomy.js";
import { registerLookup } from "./routes/lookup.js";
import { registerSettings } from "./routes/settings.js";

/** Build the Fastify app. Call migrate()/seedIfEmpty() before this so the
 *  repositories' prepared statements bind against existing tables. */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

  // Optional bearer-token gate (belt-and-braces on top of LAN/tailnet-only
  // reachability). Off by default; /api/health stays open for the HA watchdog.
  if (config.authToken) {
    app.addHook("onRequest", async (req, reply) => {
      if (!req.url.startsWith("/api/") || req.url === "/api/health") return;
      if (req.headers.authorization !== `Bearer ${config.authToken}`) {
        return reply.code(401).send({ error: { message: "unauthorized" } });
      }
    });
  }

  app.register(registerHealth, { prefix: "/api" });
  app.register(registerInventory, { prefix: "/api" });
  app.register(registerProducts, { prefix: "/api" });
  app.register(registerStockLots, { prefix: "/api" });
  app.register(registerQr, { prefix: "/api" });
  app.register(registerTaxonomy, { prefix: "/api" });
  app.register(registerLookup, { prefix: "/api" });
  app.register(registerSettings, { prefix: "/api" });

  const webDist = process.env.WEB_DIST;
  if (webDist) {
    // Production: serve the built PWA so app + API share one origin.
    app.register(import("@fastify/static"), { root: webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== "GET" || req.url.startsWith("/api")) {
        return reply.code(404).send({ error: { message: "not found" } });
      }
      // SPA fallback so client routes (/item/:id, …) resolve on reload.
      return (reply as unknown as { sendFile: (p: string) => unknown }).sendFile("index.html");
    });
  } else {
    // Dev: the Vite dev server proxies /api here, so no static hosting needed.
    app.setNotFoundHandler((_req, reply) =>
      reply.code(404).send({ error: { message: "not found" } }),
    );
  }

  return app;
}
