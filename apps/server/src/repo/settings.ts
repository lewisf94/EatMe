import { DIETARY_REQUIREMENTS, type DietaryRequirement } from "@eatme/shared";
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

/** Stores a panel's self-reported LiPo percentage. Shared by every display
 *  route (the classic panel and the MagTag both report on their image fetch),
 *  since there's only one battery worth tracking per household. */
export function recordDisplayBattery(raw: string | undefined): void {
  const battery = Number(raw);
  if (raw != null && raw !== "" && Number.isFinite(battery))
    setSetting("display_battery", String(Math.max(0, Math.min(100, Math.round(battery)))));
}

export function dietaryRequirements(): DietaryRequirement[] {
  try {
    const values = JSON.parse(getSetting("dietary_requirements", "[]")) as unknown;
    return Array.isArray(values)
      ? values.filter((value): value is DietaryRequirement =>
          DIETARY_REQUIREMENTS.includes(value as DietaryRequirement),
        )
      : [];
  } catch {
    return [];
  }
}
