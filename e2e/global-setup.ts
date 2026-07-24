/** The per-run SQLite wipe now happens in playwright.config.ts, which is
 *  evaluated before the web servers launch — see the note there. Kept as a
 *  no-op so there's an obvious home for any future global setup. */
export default function globalSetup(): void {}
