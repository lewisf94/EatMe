// What to notify about, and when. Deliberately sparse — nagging kills these
// apps. Pure and dependency-free, so the rules can be tested with fixtures
// instead of waiting until 09:00 on a Monday.
import type { InventoryRow } from "@eatme/shared";

export type PushPayload = { title: string; body: string; url: string };

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The Monday nudge: how much wants eating this week. Null when there's nothing
 *  worth interrupting someone for. */
export function weeklyDigest(rows: InventoryRow[]): PushPayload | null {
  const soon = rows.filter((r) => r.status === "use_soon").length;
  const slipping = rows.filter(
    (r) => r.status === "past_best" || r.status === "quality_declining",
  ).length;
  if (soon + slipping === 0) return null;

  const parts = [
    soon > 0 ? `${count(soon, "thing", "things")} to use this week` : "",
    slipping > 0 ? `${slipping} already past its best` : "",
  ].filter(Boolean);
  return { title: "EatMe", body: parts.join(" · "), url: "/use-it-up" };
}

/** The day-before safety warning — only ever for a use-by, never a best-before:
 *  one is "don't eat this", the other is "it won't be at its best". */
export function useByTomorrow(rows: InventoryRow[]): PushPayload | null {
  const due = rows.filter((r) => r.pressureKind === "use_by" && r.daysLeft === 1);
  if (due.length === 0) return null;
  const names = due.slice(0, 3).map((r) => r.name);
  const rest = due.length - names.length;
  return {
    title: due.length === 1 ? `${names[0]} — use by tomorrow` : "Use by tomorrow",
    body: names.join(", ") + (rest > 0 ? ` and ${count(rest, "other", "others")}` : ""),
    url: "/",
  };
}

export type JobName = "digest" | "expiry";
const TARGET_HOUR: Record<JobName, number> = { digest: 9, expiry: 8 };
const MONDAY = 1;

/** Which jobs are due, given the household's local clock and when each last
 *  fired. Fires at most once per local day, so a restart can't double-send —
 *  and a server that was asleep at 09:00 still sends when it wakes. */
export function jobsDue(
  local: { date: string; weekday: number; hour: number },
  lastFired: Record<JobName, string>,
): JobName[] {
  const due: JobName[] = [];
  if (
    local.weekday === MONDAY &&
    local.hour >= TARGET_HOUR.digest &&
    lastFired.digest !== local.date
  )
    due.push("digest");
  if (local.hour >= TARGET_HOUR.expiry && lastFired.expiry !== local.date) due.push("expiry");
  return due;
}

/** A push service says a subscription is gone with 404/410 — the only errors
 *  that mean "delete this", as opposed to "couldn't deliver right now". */
export function isGone(err: unknown): boolean {
  const status = (err as { statusCode?: number } | null)?.statusCode;
  return status === 404 || status === 410;
}
