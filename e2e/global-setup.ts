import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Wipe the per-run SQLite data dirs so every e2e run starts from the seed. */
export default function globalSetup() {
  const tmp = path.join(path.dirname(fileURLToPath(import.meta.url)), ".e2e-tmp");
  rmSync(tmp, { recursive: true, force: true });
}
