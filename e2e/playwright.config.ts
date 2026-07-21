import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

// Two independent servers off one web build: a normal one, and one with the
// optional bearer-token gate on (so the auth spec can prove the client sends it).
const NOAUTH_PORT = 8099;
const AUTH_PORT = 8100;
const AUTH_TOKEN = "e2e-secret";
const WEB_DIST = path.join(repoRoot, "apps/web/dist");
const Y4M = path.join(here, "fixtures/barcode.y4m");

// In CI we `playwright install chromium`, so let Playwright resolve its own
// browser. In a pre-provisioned sandbox set PW_CHROMIUM_PATH to that binary.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

const server = (port: number, dataSub: string, extra: Record<string, string> = {}) => ({
  // Run from the server package so tsx + the default migrations path resolve.
  command: "pnpm --filter @whattoeat/server exec tsx src/index.ts",
  cwd: repoRoot,
  port,
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
  env: {
    PORT: String(port),
    DATA_DIR: path.join(here, ".e2e-tmp", dataSub),
    WEB_DIST,
    ...extra,
  },
});

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  globalSetup: "./global-setup.ts",
  use: { trace: "on-first-retry" },
  projects: [
    {
      name: "app",
      testIgnore: /auth\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${NOAUTH_PORT}`,
        permissions: ["camera"],
        // Feed the scanner a synthetic "webcam" clip of an EAN-13 barcode.
        launchOptions: {
          executablePath,
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            `--use-file-for-fake-video-capture=${Y4M}`,
          ],
        },
      },
    },
    {
      name: "auth",
      testMatch: /auth\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${AUTH_PORT}`,
        launchOptions: { executablePath },
      },
    },
  ],
  webServer: [server(NOAUTH_PORT, "noauth"), server(AUTH_PORT, "auth", { AUTH_TOKEN })],
});
