import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import { registerHealth } from "./routes/health.js";
import { registerInventory } from "./routes/inventory.js";
import { registerProducts } from "./routes/products.js";
import { registerStockLots } from "./routes/stockLots.js";
import { registerQr } from "./routes/qr.js";
import { registerReceipts } from "./routes/receipts.js";
import { registerTaxonomy } from "./routes/taxonomy.js";
import { registerLookup } from "./routes/lookup.js";
import { registerSettings } from "./routes/settings.js";
import { registerDisplay } from "./routes/display.js";
import { registerMagtag } from "./routes/magtag.js";
import { registerRecipes } from "./routes/recipes.js";
import { registerShopping } from "./routes/shopping.js";
import { registerPush } from "./routes/push.js";
import { registerLabels } from "./routes/labels.js";
import { registerGuidance } from "./routes/guidance.js";
import { redactRequestUrl } from "./services/logging.js";
import { bearerCredential, secretMatches } from "./services/security.js";

/** Build the Fastify app. Call migrate()/seedIfEmpty() before this so the
 *  repositories' prepared statements bind against existing tables. */
export function buildApp(): FastifyInstance {
  // Keep ordinary API bodies small enough that an unauthenticated LAN client
  // cannot make Node buffer multi-megabyte JSON. Receipt upload opts into its
  // own larger, bounded image limit at the route.
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      // Display credentials travel in the query string because the e-ink
      // clients cannot reliably send an Authorization header. Keep useful
      // request logging, but never persist those device tokens in HA logs.
      redact: { paths: ["req.url"], censor: redactRequestUrl },
    },
    bodyLimit: 262_144,
    requestTimeout: 120_000,
    forceCloseConnections: "idle",
    // Home Assistant and reverse proxies provide the public scheme/host here.
    // Printed QR codes must use that external HTTPS origin, not the container's.
    trustProxy: true,
  });

  // Accept a raw image body for receipt upload (no multipart dependency needed).
  app.addContentTypeParser(
    ["application/octet-stream", "image/jpeg", "image/png", "image/webp"],
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body),
  );

  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Permitted-Cross-Domain-Policies", "none");
    if (req.url.split("?")[0].startsWith("/api/") && !reply.hasHeader("Cache-Control")) {
      reply.header("Cache-Control", "no-store");
    }
    return payload;
  });

  app.setErrorHandler((error, req, reply) => {
    const statusValue =
      typeof error === "object" && error !== null && "statusCode" in error
        ? error.statusCode
        : undefined;
    const status = typeof statusValue === "number" ? statusValue : 500;
    if (status >= 500) {
      req.log.error({ err: error }, "request failed");
      return reply.code(500).send({ error: { message: "internal server error" } });
    }
    const message = error instanceof Error ? error.message : "bad request";
    return reply.code(status).send({ error: { message } });
  });

  // Optional bearer-token gate (belt-and-braces on top of LAN/tailnet-only
  // reachability). Off by default; /api/health stays open for the HA watchdog.
  if (config.authToken) {
    app.addHook("onRequest", async (req, reply) => {
      const path = req.url.split("?")[0];
      if (!path.startsWith("/api/") || path === "/api/health") return;
      // The e-ink panel can't send an Authorization header, so display.png
      // carries its own ?token= gate (checked in the route) when one is set.
      if (path === "/api/display.png" && config.displayToken) return;
      // Same reasoning for the MagTag, plus it must never carry the household
      // admin token — MAGTAG_TOKEN is its own device-scoped credential.
      if (path.startsWith("/api/magtag/") && config.magtagToken) return;
      if (!secretMatches(bearerCredential(req.headers.authorization), config.authToken)) {
        return reply.code(401).send({ error: { message: "unauthorized" } });
      }
    });
  }

  app.register(registerHealth, { prefix: "/api" });
  app.register(registerInventory, { prefix: "/api" });
  app.register(registerProducts, { prefix: "/api" });
  app.register(registerStockLots, { prefix: "/api" });
  app.register(registerQr, { prefix: "/api" });
  app.register(registerReceipts, { prefix: "/api" });
  app.register(registerTaxonomy, { prefix: "/api" });
  app.register(registerLookup, { prefix: "/api" });
  app.register(registerGuidance, { prefix: "/api" });
  app.register(registerSettings, { prefix: "/api" });
  app.register(registerDisplay, { prefix: "/api" });
  app.register(registerMagtag, { prefix: "/api" });
  app.register(registerRecipes, { prefix: "/api" });
  app.register(registerShopping, { prefix: "/api" });
  app.register(registerPush, { prefix: "/api" });
  app.register(registerLabels);

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
