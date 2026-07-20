import { db } from "./db.js";
import { newId } from "@whattoeat/shared";

const DEFAULT_LOCATIONS = ["Cupboard", "Spice rack", "Fridge", "Freezer", "Baking shelf"];

/** Sensible starting points, editable in the app — not food-safety advice. */
const DEFAULT_CATEGORIES: Array<{
  name: string;
  openLifeDays: number | null;
  warnDays: number;
  hardExpiry: boolean;
}> = [
  { name: "Ground spices", openLifeDays: 270, warnDays: 30, hardExpiry: false },
  { name: "Whole spices", openLifeDays: 730, warnDays: 30, hardExpiry: false },
  { name: "Dried herbs", openLifeDays: 270, warnDays: 30, hardExpiry: false },
  { name: "Cooking pastes (jar)", openLifeDays: 42, warnDays: 7, hardExpiry: true },
  { name: "Cooking sauces (jar)", openLifeDays: 7, warnDays: 3, hardExpiry: true },
  { name: "Chutneys & pickles", openLifeDays: 90, warnDays: 14, hardExpiry: true },
  { name: "Jams & spreads", openLifeDays: 90, warnDays: 14, hardExpiry: true },
  { name: "Oils", openLifeDays: 180, warnDays: 21, hardExpiry: false },
  { name: "Nuts & seeds", openLifeDays: 120, warnDays: 21, hardExpiry: false },
  { name: "Flour & baking", openLifeDays: 240, warnDays: 30, hardExpiry: false },
  { name: "Dried pasta, rice, pulses", openLifeDays: null, warnDays: 14, hardExpiry: false },
  { name: "Tins (unopened)", openLifeDays: null, warnDays: 14, hardExpiry: false },
];

/** Populate default locations and categories on a fresh database only. */
export function seedIfEmpty(): void {
  const locCount = (db.prepare("SELECT COUNT(*) AS n FROM locations").get() as { n: number }).n;
  if (locCount === 0) {
    const stmt = db.prepare("INSERT INTO locations (id, name, sort_order) VALUES (?, ?, ?)");
    DEFAULT_LOCATIONS.forEach((name, i) => stmt.run(newId(), name, i));
  }

  const catCount = (db.prepare("SELECT COUNT(*) AS n FROM categories").get() as { n: number }).n;
  if (catCount === 0) {
    const stmt = db.prepare(
      "INSERT INTO categories (id, name, open_life_days, warn_days, hard_expiry) VALUES (?, ?, ?, ?, ?)",
    );
    for (const c of DEFAULT_CATEGORIES) {
      stmt.run(newId(), c.name, c.openLifeDays, c.warnDays, c.hardExpiry ? 1 : 0);
    }
  }
}
