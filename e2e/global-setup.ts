import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const serverRoot = path.join(repoRoot, "apps/server");
const webDist = path.join(repoRoot, "apps/web/dist");
const children: ChildProcess[] = [];

function startServer(port: number, dataSub: string, extra: Record<string, string> = {}) {
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: serverRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: path.join(here, ".e2e-tmp", dataSub),
      WEB_DIST: webDist,
      ...extra,
    },
    stdio: ["ignore", "ignore", "inherit"],
    windowsHide: true,
  });
  children.push(child);
  return child;
}

async function waitUntilReady(child: ChildProcess, port: number): Promise<void> {
  const deadline = Date.now() + 120_000;
  const url = `http://127.0.0.1:${port}/api/health`;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`EatMe test server on ${port} exited early`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // The listener is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`EatMe test server on ${port} did not become healthy`);
}

async function stopServers(): Promise<void> {
  await Promise.all(
    children.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null) return resolve();
          const forceTimer = setTimeout(() => {
            child.kill("SIGKILL");
            resolve();
          }, 5_000);
          child.once("exit", () => {
            clearTimeout(forceTimer);
            resolve();
          });
          child.kill();
        }),
    ),
  );
}

export default async function globalSetup(): Promise<(() => Promise<void>) | undefined> {
  if (process.platform !== "win32") return undefined;
  try {
    const noAuth = startServer(8099, "noauth");
    const auth = startServer(8100, "auth", { AUTH_TOKEN: "e2e-secret" });
    await Promise.all([waitUntilReady(noAuth, 8099), waitUntilReady(auth, 8100)]);
  } catch (error) {
    await stopServers();
    throw error;
  }
  return stopServers;
}
