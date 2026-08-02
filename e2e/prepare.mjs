import { rmSync } from "node:fs";

// Playwright evaluates its config in test workers as well as in the parent.
// Clear SQLite data once, before any web server or worker can open the files.
rmSync(new URL("./.e2e-tmp", import.meta.url), { recursive: true, force: true });
