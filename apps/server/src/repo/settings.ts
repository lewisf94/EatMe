import { db } from "../db.js";

const getStmt = db.prepare("SELECT value FROM settings WHERE key = ?");
const setStmt = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
);

export function getSetting(key: string, fallback = ""): string {
  const r = getStmt.get(key) as { value: string } | undefined;
  return r?.value ?? fallback;
}

export function setSetting(key: string, value: string): void {
  setStmt.run(key, value);
}

/** The household's IANA timezone — used for all civil-date calculations. */
export function timezone(): string {
  return getSetting("household_timezone", "Europe/London");
}
