import { migrate } from "./db.js";
import { seedIfEmpty } from "./seed.js";
import { config } from "./config.js";

migrate();
seedIfEmpty();

// Import the app (and its repositories' prepared statements) only after the
// schema exists, so module-load statement preparation binds successfully.
const { buildApp } = await import("./app.js");
const app = buildApp();

try {
  const addr = await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`WhatToEat server listening on ${addr}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
