import { db, migrate } from "./db.js";
import { seedIfEmpty } from "./seed.js";
import { config } from "./config.js";

migrate();
seedIfEmpty();

// Import the app (and its repositories' prepared statements) only after the
// schema exists, so module-load statement preparation binds successfully.
const { buildApp } = await import("./app.js");
const app = buildApp();
let pushTimer: NodeJS.Timeout | undefined;
let homeAssistantTimer: NodeJS.Timeout | undefined;
let automaticBackupTimer: NodeJS.Timeout | undefined;
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "shutting down");
  if (pushTimer) clearInterval(pushTimer);
  if (homeAssistantTimer) clearInterval(homeAssistantTimer);
  if (automaticBackupTimer) clearInterval(automaticBackupTimer);
  let exitCode = 0;
  const forceCloseTimer = setTimeout(() => {
    app.log.warn("shutdown grace period expired; closing remaining connections");
    app.server.closeAllConnections();
  }, 5_000);
  forceCloseTimer.unref();
  try {
    await app.close();
  } catch (error) {
    console.error("server shutdown failed", error);
    exitCode = 1;
  } finally {
    clearTimeout(forceCloseTimer);
  }
  try {
    db.close();
  } catch (error) {
    console.error("database shutdown failed", error);
    exitCode = 1;
  }
  // Signal handlers suppress Node's default termination. Exit only after both
  // the listener and database have had a chance to close cleanly.
  process.exit(exitCode);
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => void shutdown(signal));
}

try {
  const addr = await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`EatMe server listening on ${addr}`);
  if (!config.authToken)
    app.log.warn("auth_token is empty; the household API is writable by devices on the LAN");
  if (!config.displayToken) app.log.warn("display_token is empty; the classic display is open");
  if (!config.magtagToken) app.log.warn("magtag_token is empty; MagTag routes are open");
  // Notification schedule (Monday digest, day-before use-by warning). Started
  // after listen so a push problem can never stop the server coming up.
  const { startPushSchedule, runDueJobs } = await import("./services/push.js");
  pushTimer = startPushSchedule();
  void runDueJobs().catch((err) => app.log.warn({ err }, "push jobs failed"));
  const { syncHomeAssistant } = await import("./services/homeAssistant.js");
  const publishHomeAssistant = () =>
    void syncHomeAssistant().catch((err) => app.log.warn({ err }, "Home Assistant sync failed"));
  publishHomeAssistant();
  homeAssistantTimer = setInterval(publishHomeAssistant, 15 * 60_000);
  homeAssistantTimer.unref();
  const { ensureDailyAutomaticBackup } = await import("./services/backup.js");
  const { getSetting } = await import("./repo/settings.js");
  const maintainBackups = () => {
    try {
      ensureDailyAutomaticBackup(Number(getSetting("backup_retention", "7")));
    } catch (err) {
      app.log.warn({ err }, "automatic backup failed");
    }
  };
  maintainBackups();
  automaticBackupTimer = setInterval(maintainBackups, 6 * 60 * 60_000);
  automaticBackupTimer.unref();
} catch (err) {
  console.error(err);
  try {
    await app.close();
    db.close();
  } catch {
    // Preserve the startup error as the useful failure.
  }
  process.exitCode = 1;
}
